import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { RecipeVersionEntity } from '@rsn/api/data-access-db';
import { UsdaService } from '@rsn/api/data-access-usda';
import type { UsdaDataType, UsdaFoodHit } from '@rsn/api/data-access-usda';
import type { AuthUser } from '@rsn/api/feature-auth';
import { RecipeAccessService } from '@rsn/api/feature-recipes';
import type {
  IngredientNutritionDto,
  NutritionMode,
  NutritionResponse,
} from '@rsn/shared/util-contracts';
import type { Ingredient } from '@rsn/shared/util-domain';
import { toTwoDecimals } from '@rsn/shared/util-domain';

import { rankFoods, strictQuery } from './food-matcher';
import { gramsFor } from './grams-converter';
import {
  isHouseholdMeasure,
  pickMeasureGrams,
  pickPieceGrams,
} from './portion-picker';
import { SEASONING_DESCRIPTION, isSeasoning } from './seasonings';
import { gramsFromWeightNote } from './weight-note';
import { estimateFrom } from './nutrition-estimate';

/** One mode's response before NUT-11 adds the `estimate` from both modes. */
type ModeResponse = Omit<NutritionResponse, 'estimate'>;

/** NUT-6: ingredient search order, best analytical data first. */
const INGREDIENT_DATA_TYPES: UsdaDataType[] = [
  'SR Legacy',
  'Foundation',
  'Survey (FNDDS)',
];

/** NUT-6: meal-name lookup uses the FNDDS composite dishes only. */
const MEAL_DATA_TYPES: UsdaDataType[] = ['Survey (FNDDS)'];

/** NUT-6, NUT-9: how many of the next ranked hits may lend a measure (cup, tbsp, tsp) or piece weight to the chosen food. */
const PIECE_FALLBACK_HITS = 3;

/** §9 (U1): the USDA limit is 1,000 requests/hour, so ingredients go 4 at a time. */
const USDA_CONCURRENCY = 4;

/** NUT-2: the only data source named in the response. */
const NUTRITION_SOURCE = 'USDA FoodData Central';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Runs `worker` over every item with at most `limit` in flight, awaiting the
 * whole set with a single `Promise.all` (§9: stay inside the USDA rate limit).
 */
async function mapWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  worker: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = new Array<TResult>(items.length);
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async (): Promise<void> => {
      for (let index = next++; index < items.length; index = next++) {
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(lanes);
  return results;
}

/**
 * SPEC §9 NUT-1..NUT-11: calories for a recipe, from its ingredients (default)
 * or from its title as a composite dish, through FoodData Central.
 */
@Injectable()
export class NutritionService {
  constructor(
    private readonly access: RecipeAccessService,
    private readonly usda: UsdaService,
  ) {}

  /**
   * NUT-1, NUT-3: nutrition for a recipe the caller may view. `mode` picks the
   * ingredient sum (NUT-4 default) or the meal-name lookup.
   */
  async compute(
    user: AuthUser,
    recipeId: string,
    mode: NutritionMode,
  ): Promise<NutritionResponse> {
    const recipe = await this.access.loadOrThrow(recipeId);
    await this.access.assertCanView(user.id, recipe);

    const version = recipe.currentVersion;
    if (version === null || version === undefined) {
      throw new NotFoundException('Recipe has no current version');
    }

    // NUT-11: both modes are computed whichever was asked (the USDA cache keeps the
    // repeat cheap); the asked mode's errors propagate as before, while a USDA outage
    // (503) in the other mode only leaves that value out of the estimate.
    if (mode === 'meal') {
      const [meal, ingredients] = await Promise.all([
        this.computeMeal(version),
        this.otherMode(() => this.computeIngredients(version)),
      ]);
      return { ...meal, estimate: estimateFrom(ingredients, meal) };
    }
    const [ingredients, meal] = await Promise.all([
      this.computeIngredients(version),
      this.otherMode(() => this.computeMeal(version)),
    ]);
    return { ...ingredients, estimate: estimateFrom(ingredients, meal) };
  }

  /** NUT-11: the mode that was not asked; a USDA outage (503) yields null instead of failing. */
  private async otherMode(
    run: () => Promise<ModeResponse>,
  ): Promise<ModeResponse | null> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return null;
      }
      throw error;
    }
  }

  /**
   * NUT-6 ingredients mode: per ingredient a seasoning (no search) or a food
   * chosen by NUT-8 (one or two searches), kcal/100 g scaled
   * by the ingredient's grams, summed over the ingredients that matched.
   */
  private async computeIngredients(
    version: RecipeVersionEntity,
  ): Promise<ModeResponse> {
    const ingredients = version.ingredients ?? [];
    const rows = await mapWithConcurrency(
      ingredients,
      USDA_CONCURRENCY,
      (ingredient: Ingredient): Promise<IngredientNutritionDto> =>
        this.nutritionForIngredient(ingredient),
    );

    // NUT-5, NUT-6: the total sums what matched; `partial` flags the rest.
    let sum = 0;
    let anyAvailable = false;
    let partial = false;
    for (const row of rows) {
      if (row.kcal === null) {
        partial = true;
      } else {
        sum += row.kcal;
        anyAvailable = true;
      }
    }

    const kcalTotal = anyAvailable ? round1(sum) : null;
    return {
      mode: 'ingredients',
      servings: version.servings,
      kcalPerPortion: this.perPortion(kcalTotal, version.servings),
      kcalTotal,
      partial,
      ingredients: rows,
      matchedDescription: null,
      source: NUTRITION_SOURCE,
    };
  }

  /**
   * NUT-5..NUT-10: one ingredient. A seasoning is 0 kcal without a lookup; an
   * empty quantity, or the `none` unit without a weight note, is unmatched
   * without a lookup; a USDA outage for this ingredient (503) leaves it
   * unmatched too, while a 429 propagates and fails the request.
   */
  private async nutritionForIngredient(
    ingredient: Ingredient,
  ): Promise<IngredientNutritionDto> {
    const unavailable: IngredientNutritionDto = {
      name: ingredient.name,
      grams: null,
      kcal: null,
      matchedDescription: null,
    };
    if (ingredient.name.trim() === '') {
      return unavailable;
    }
    if (isSeasoning(ingredient.name)) {
      return {
        ...unavailable,
        kcal: 0,
        matchedDescription: SEASONING_DESCRIPTION,
      };
    }

    // NUT-10: "1 lb" / "4 oz" kept as a `none` note by CAT-6 is a weight.
    const weightGrams =
      ingredient.unit === 'none' ? gramsFromWeightNote(ingredient.note) : null;
    if (
      (ingredient.unit === 'none' && weightGrams === null) ||
      (ingredient.unit !== 'none' && ingredient.quantity === null)
    ) {
      return unavailable;
    }

    try {
      const ranked = await this.findFoods(ingredient.name);
      const hit = ranked[0];
      if (hit === undefined) {
        return unavailable;
      }

      // NUT-9: `piece` needs the weight of one piece of the chosen food, or of
      // a next-ranked hit of the same search. NUT-6: `cup`, `tbsp` and `tsp`
      // use the chosen food's own portion for that measure when it has one.
      let portionGramWeight: number | null = null;
      const unit = ingredient.unit;
      if (unit === 'piece') {
        portionGramWeight = await this.pieceGrams(ranked, ingredient);
      } else if (isHouseholdMeasure(unit)) {
        portionGramWeight = await this.measureGrams(ranked, unit);
      }

      const grams = weightGrams ?? gramsFor(ingredient, portionGramWeight);
      const kcal =
        grams === null || hit.kcalPer100g === null
          ? null
          : round1((hit.kcalPer100g * grams) / 100);
      return {
        name: ingredient.name,
        grams: grams === null ? null : toTwoDecimals(grams),
        kcal,
        matchedDescription: hit.description,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return unavailable;
      }
      throw error;
    }
  }

  /**
   * NUT-9: the weight of one piece from the chosen food (`ranked[0]`); when it
   * has no piece portion, from the next hits of the same search in score order,
   * at most 3 of them. The kcal per 100 g stay the chosen food's. Null when
   * none of them has a piece portion (NUT-5).
   */
  private async pieceGrams(
    ranked: readonly UsdaFoodHit[],
    ingredient: Ingredient,
  ): Promise<number | null> {
    for (const candidate of ranked.slice(0, 1 + PIECE_FALLBACK_HITS)) {
      const detail = await this.usda.getFood(candidate.fdcId);
      const grams =
        detail === null
          ? null
          : pickPieceGrams(detail.portions, ingredient.name, ingredient.note);
      if (grams !== null) {
        return grams;
      }
    }
    return null;
  }

  /**
   * NUT-6: the weight of one cup, tablespoon or teaspoon from the chosen food's
   * own portions; when it has none, from the next hits of the same search in
   * score order, at most 3, like the NUT-9 piece fallback. Null means the water
   * density applies.
   */
  private async measureGrams(
    ranked: readonly UsdaFoodHit[],
    unit: Parameters<typeof pickMeasureGrams>[1],
  ): Promise<number | null> {
    for (const candidate of ranked.slice(0, 1 + PIECE_FALLBACK_HITS)) {
      const detail = await this.usda.getFood(candidate.fdcId);
      const grams =
        detail === null ? null : pickMeasureGrams(detail.portions, unit);
      if (grams !== null) {
        return grams;
      }
    }
    return null;
  }

  /**
   * NUT-8: search with every name word required and `raw` ranked higher,
   * then rank the hits; when none survives, search once more with the name.
   * Returns the surviving hits of the search that chose the food, best first
   * (empty when neither search leaves one).
   */
  private async findFoods(name: string): Promise<UsdaFoodHit[]> {
    const strict = rankFoods(
      name,
      await this.usda.searchFoods(strictQuery(name), INGREDIENT_DATA_TYPES),
    );
    if (strict.length > 0) {
      return strict;
    }
    const loose = await this.usda.searchFoods(name, INGREDIENT_DATA_TYPES);
    return rankFoods(name, loose);
  }

  /**
   * NUT-3, NUT-6 meal mode: the title is searched in FNDDS; the first hit's
   * kcal/100 g and a portion weight (`foodMeasures[0].gramWeight`, else the
   * first `foodPortions[].gramWeight`) give kcal per portion. With no portion
   * weight only the kcal/100 g basis is reported and the answer stays partial.
   */
  private async computeMeal(
    version: RecipeVersionEntity,
  ): Promise<ModeResponse> {
    const hit = (
      await this.usda.searchFoods(version.title, MEAL_DATA_TYPES)
    )[0];
    if (hit === undefined) {
      return {
        mode: 'meal',
        servings: version.servings,
        kcalPerPortion: null,
        kcalTotal: null,
        partial: true,
        ingredients: [],
        matchedDescription: null,
        source: NUTRITION_SOURCE,
      };
    }

    let portionGrams = hit.gramWeightPerMeasure;
    if (portionGrams === null) {
      const detail = await this.usda.getFood(hit.fdcId);
      portionGrams = detail?.portions[0]?.gramWeight ?? null;
    }

    const kcalPer100g = hit.kcalPer100g;
    // With no portion weight the basis falls back to 100 g so kcal/100 g shows.
    const basisGrams = portionGrams ?? (kcalPer100g === null ? null : 100);
    const kcalForBasis =
      basisGrams === null || kcalPer100g === null
        ? null
        : round1((kcalPer100g * basisGrams) / 100);
    const kcalPerPortion =
      portionGrams === null || kcalPer100g === null
        ? null
        : Math.round((kcalPer100g * portionGrams) / 100);

    return {
      mode: 'meal',
      servings: version.servings,
      kcalPerPortion,
      kcalTotal:
        kcalPerPortion === null
          ? null
          : Math.round(kcalPerPortion * version.servings),
      partial: kcalPerPortion === null,
      ingredients: [
        {
          name: version.title,
          grams: basisGrams === null ? null : toTwoDecimals(basisGrams),
          kcal: kcalForBasis,
          matchedDescription: hit.description,
        },
      ],
      matchedDescription: hit.description,
      source: NUTRITION_SOURCE,
    };
  }

  /** NUT-6: total ÷ servings, whole kcal; null when nothing matched. */
  private perPortion(
    kcalTotal: number | null,
    servings: number,
  ): number | null {
    if (kcalTotal === null || servings < 1) {
      return null;
    }
    return Math.round(kcalTotal / servings);
  }
}

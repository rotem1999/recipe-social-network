// SPEC §9 NUT-1..NUT-11. The USDA client is a hand-written fake at its module
// boundary: no network, no key, no database.
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecipeEntity, RecipeVersionEntity } from '@rsn/api/data-access-db';
import type {
  UsdaFoodDetail,
  UsdaFoodHit,
  UsdaService,
} from '@rsn/api/data-access-usda';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { Ingredient } from '@rsn/shared/util-domain';

import { NutritionService } from './nutrition.service';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. These
 * tests use plain constructor injection, so those packages are replaced at their module
 * boundary by the decorators and module helpers the files under test touch when loaded.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
  getRepositoryToken: (entity: { name: string }) => `${entity.name}Repository`,
  TypeOrmModule: {
    forRoot: () => ({}),
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
  JwtModule: { register: () => ({}), registerAsync: () => ({}) },
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const USER: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'rotem',
};
const RECIPE_ID = '11111111-1111-4111-8111-111111111111';

/** Field names as SPEC §9 lists them for FoodData Central search results. */
function hit(overrides: Partial<UsdaFoodHit> = {}): UsdaFoodHit {
  return {
    fdcId: 169761,
    description: 'Noodles, egg, dry, enriched',
    dataType: 'SR Legacy',
    kcalPer100g: 384,
    gramWeightPerMeasure: null,
    ...overrides,
  };
}

function version(
  ingredients: Ingredient[],
  servings = 4,
  title = 'Lasagna with meat',
): RecipeVersionEntity {
  return {
    title,
    servings,
    ingredients,
    steps: [{ text: 'Cook' }],
  } as RecipeVersionEntity;
}

interface Harness {
  service: NutritionService;
  access: { loadOrThrow: jest.Mock; assertCanView: jest.Mock };
  usda: { searchFoods: jest.Mock; getFood: jest.Mock };
}

function makeHarness(currentVersion: RecipeVersionEntity | null): Harness {
  const recipe = {
    id: RECIPE_ID,
    ownerId: USER.id,
    visibility: 'private',
    deletedAt: null,
    currentVersion,
  } as RecipeEntity;

  const access = {
    loadOrThrow: jest.fn().mockResolvedValue(recipe),
    assertCanView: jest.fn().mockResolvedValue(undefined),
  };
  const usda = {
    searchFoods: jest.fn().mockResolvedValue([]),
    getFood: jest.fn().mockResolvedValue(null),
  };

  return {
    service: new NutritionService(
      access as unknown as RecipeAccessService,
      usda as unknown as UsdaService,
    ),
    access,
    usda,
  };
}

describe('NutritionService.compute access and mode (NUT-1, NUT-3, NUT-4)', () => {
  it('NUT-1 refuses a recipe the caller may not view', async () => {
    const harness = makeHarness(version([]));
    harness.access.assertCanView.mockRejectedValue(
      new ForbiddenException('You cannot view this recipe'),
    );

    await expect(
      harness.service.compute(USER, RECIPE_ID, 'ingredients'),
    ).rejects.toThrow(ForbiddenException);
    expect(harness.usda.searchFoods).not.toHaveBeenCalled();
  });

  it('NUT-1 reports 404 when the recipe has no current version', async () => {
    const harness = makeHarness(null);

    await expect(
      harness.service.compute(USER, RECIPE_ID, 'ingredients'),
    ).rejects.toThrow(NotFoundException);
  });

  it('NUT-2 names USDA FoodData Central as the source', async () => {
    const harness = makeHarness(version([]));

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.source).toBe('USDA FoodData Central');
  });
});

/** NUT-6 ingredient search: SR Legacy, Foundation, Survey (FNDDS). */
const INGREDIENT_DATA_TYPES = ['SR Legacy', 'Foundation', 'Survey (FNDDS)'];

/** NUT-6 meal-name search: Survey (FNDDS) only. */
const MEAL_DATA_TYPES = ['Survey (FNDDS)'];

/**
 * NUT-11: both modes run on every request, so USDA calls are counted per mode:
 * the ingredients-mode searches are the ones sent with the ingredient data types.
 */
function ingredientSearches(harness: Harness): unknown[][] {
  return harness.usda.searchFoods.mock.calls.filter(
    ([, dataTypes]) =>
      JSON.stringify(dataTypes) === JSON.stringify(INGREDIENT_DATA_TYPES),
  );
}

/** NUT-11: the meal-mode searches (the title, FNDDS only). */
function mealSearches(harness: Harness): unknown[][] {
  return harness.usda.searchFoods.mock.calls.filter(
    ([, dataTypes]) =>
      JSON.stringify(dataTypes) === JSON.stringify(MEAL_DATA_TYPES),
  );
}

/**
 * Answers `searchFoods` by exact query text, since ingredients are looked up
 * concurrently: a missing query yields no hits, an Error value is thrown.
 */
function searchReturns(
  harness: Harness,
  table: Record<string, UsdaFoodHit[] | Error>,
): void {
  harness.usda.searchFoods.mockImplementation(async (query: string) => {
    const entry = table[query];
    if (entry === undefined) return [];
    if (entry instanceof Error) throw entry;
    return entry;
  });
}

function detail(
  fdcId: number,
  description: string,
  portions: UsdaFoodDetail['portions'],
): UsdaFoodDetail {
  return { fdcId, description, kcalPer100g: null, portions };
}

describe('NutritionService.compute ingredients mode (NUT-4, NUT-5, NUT-6)', () => {
  it('NUT-6 searches SR Legacy, Foundation and Survey (FNDDS) per ingredient', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }]),
    );
    harness.usda.searchFoods.mockResolvedValue([hit()]);

    await harness.service.compute(USER, RECIPE_ID, 'ingredients');

    expect(harness.usda.searchFoods).toHaveBeenCalledWith(
      '+egg +noodles raw',
      INGREDIENT_DATA_TYPES,
    );
  });

  it('NUT-6 computes kcal as kcal/100 g times grams divided by 100', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 4),
    );
    harness.usda.searchFoods.mockResolvedValue([hit({ kcalPer100g: 384 })]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 384 kcal/100 g × 200 g / 100 = 768
    expect(response.ingredients).toEqual([
      {
        name: 'egg noodles',
        grams: 200,
        kcal: 768,
        matchedDescription: 'Noodles, egg, dry, enriched',
      },
    ]);
    expect(response.kcalTotal).toBe(768);
    expect(response.partial).toBe(false);
    expect(response.mode).toBe('ingredients');
    expect(response.matchedDescription).toBeNull();
  });

  it('NUT-6 divides the total by the servings for the per-portion value', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 100, unit: 'g', name: 'pork belly' },
        ],
        4,
      ),
    );
    searchReturns(harness, {
      '+egg +noodles raw': [hit({ kcalPer100g: 384 })],
      '+pork +belly raw': [
        hit({ kcalPer100g: 518, description: 'Pork, fresh, belly, raw' }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 768 + 518 = 1286 total; 1286 / 4 servings = 321.5 → 322
    expect(response.kcalTotal).toBe(1286);
    expect(response.servings).toBe(4);
    expect(response.kcalPerPortion).toBe(322);
  });

  it('NUT-5 marks the answer partial when one ingredient has no USDA match', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 1, unit: 'tbsp', name: 'grandmother secret mix' },
        ],
        2,
      ),
    );
    searchReturns(harness, {
      '+egg +noodles raw': [hit({ kcalPer100g: 384 })],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.partial).toBe(true);
    expect(response.ingredients[1]).toEqual({
      name: 'grandmother secret mix',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    // The total keeps summing what did match.
    expect(response.kcalTotal).toBe(768);
  });

  it('NUT-5 leaves a "to taste" quantity unmatched without asking USDA', async () => {
    const harness = makeHarness(
      version([{ quantity: null, unit: 'ml', name: 'chili oil' }], 2),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toEqual([]);
    expect(response.partial).toBe(true);
    expect(response.kcalTotal).toBeNull();
    expect(response.kcalPerPortion).toBeNull();
  });

  it('NUT-6 leaves the `none` unit with a note that is not a weight unmatched without asking USDA', async () => {
    const harness = makeHarness(
      version(
        [{ quantity: null, unit: 'none', name: 'Chicken Stock', note: 'a splash' }],
        2,
      ),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toEqual([]);
    expect(response.ingredients[0]).toEqual({
      name: 'Chicken Stock',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    expect(response.partial).toBe(true);
  });

  it('UNSPECIFIED leaves an ingredient with a blank name unmatched without asking USDA', async () => {
    const harness = makeHarness(
      version([{ quantity: 100, unit: 'g', name: '   ' }], 2),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toEqual([]);
    expect(response.ingredients[0].kcal).toBeNull();
    expect(response.partial).toBe(true);
  });

  it('NUT-9 multiplies the chosen piece weight by the quantity for a `piece` ingredient', async () => {
    const harness = makeHarness(
      version([{ quantity: 2, unit: 'piece', name: 'egg' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 748967, description: 'Egg, whole, raw', kcalPer100g: 143 }),
    ]);
    harness.usda.getFood.mockResolvedValue(
      detail(748967, 'Egg, whole, raw', [
        { gramWeight: 50, description: '1 large', amount: null, sequenceNumber: 1 },
      ]),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.getFood).toHaveBeenCalledWith(748967);
    // 2 pieces × 50 g = 100 g → 143 kcal
    expect(response.ingredients[0].grams).toBe(100);
    expect(response.ingredients[0].kcal).toBe(143);
  });

  it('NUT-5 leaves an ingredient unavailable when USDA is down for it (503)', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 100, unit: 'g', name: 'pork belly' },
        ],
        2,
      ),
    );
    searchReturns(harness, {
      '+egg +noodles raw': [hit({ kcalPer100g: 384 })],
      '+pork +belly raw': new ServiceUnavailableException(
        'FoodData Central is unreachable',
      ),
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0].kcal).toBe(768);
    expect(response.ingredients[1]).toEqual({
      name: 'pork belly',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    expect(response.partial).toBe(true);
  });

  it('NUT-6 lets a USDA 429 fail the whole request (U1: 1,000 requests/hour)', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 2),
    );
    harness.usda.searchFoods.mockRejectedValue(
      new HttpException('USDA rate limit reached', HttpStatus.TOO_MANY_REQUESTS),
    );

    const error = await harness.service
      .compute(USER, RECIPE_ID, 'ingredients')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('NUT-8 skips a hit with no energy value, so the ingredient is unavailable (NUT-5)', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([hit({ kcalPer100g: null })]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0]).toEqual({
      name: 'egg noodles',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    expect(response.partial).toBe(true);
  });
});

describe('NutritionService.compute seasonings (NUT-7)', () => {
  it('NUT-7 counts seasonings as 0 kcal without a lookup, whatever the quantity or unit', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: null, unit: 'none', name: 'Sea Salt', note: 'to taste' },
          { quantity: 1, unit: 'tsp', name: 'Freshly Ground Black Pepper' },
          { quantity: 2, unit: 'piece', name: 'Bay Leaves' },
          { quantity: null, unit: 'none', name: 'salt & pepper' },
        ],
        4,
      ),
    );
    searchReturns(harness, {
      '+egg +noodles raw': [hit({ kcalPer100g: 384 })],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toHaveLength(1);
    expect(harness.usda.getFood).not.toHaveBeenCalled();
    for (const row of response.ingredients.slice(1)) {
      expect(row.kcal).toBe(0);
      expect(row.matchedDescription).toBe('Seasoning, counted as 0 kcal');
    }
    expect(response.ingredients.map((row) => row.name)).toEqual([
      'egg noodles',
      'Sea Salt',
      'Freshly Ground Black Pepper',
      'Bay Leaves',
      'salt & pepper',
    ]);
    expect(response.kcalTotal).toBe(768);
    expect(response.kcalPerPortion).toBe(192);
    expect(response.partial).toBe(false);
  });

  it('UNSPECIFIED gives a seasoning row `grams: null`', async () => {
    // SPEC NUT-7 names only `0 kcal` and the matchedDescription for the row.
    const harness = makeHarness(
      version([{ quantity: 1, unit: 'tsp', name: 'Ground Cumin' }], 2),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients).toEqual([
      {
        name: 'Ground Cumin',
        grams: null,
        kcal: 0,
        matchedDescription: 'Seasoning, counted as 0 kcal',
      },
    ]);
  });

  it('NUT-7 gives a recipe of seasonings only a 0 kcal total that is not partial', async () => {
    const harness = makeHarness(
      version([{ quantity: null, unit: 'none', name: 'Salt' }], 2),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.kcalTotal).toBe(0);
    expect(response.kcalPerPortion).toBe(0);
    expect(response.partial).toBe(false);
  });

  it('NUT-7 still looks up an ingredient that is not a seasoning ("Ground Beef")', async () => {
    const harness = makeHarness(
      version([{ quantity: 500, unit: 'g', name: 'Ground Beef' }], 4),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 174036, description: 'Beef, ground, raw', kcalPer100g: 254 }),
    ]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.searchFoods).toHaveBeenCalledWith(
      '+ground +beef raw',
      INGREDIENT_DATA_TYPES,
    );
    expect(response.ingredients[0].kcal).toBe(1270);
  });
});

describe('NutritionService.compute food choice (NUT-8)', () => {
  it('NUT-8 takes the best-scoring hit of the strict search, not USDA\'s first ("Garlic")', async () => {
    const harness = makeHarness(
      version([{ quantity: 10, unit: 'g', name: 'Garlic' }], 2),
    );
    searchReturns(harness, {
      '+garlic raw': [
        hit({ fdcId: 1, description: 'Garlic sauce', kcalPer100g: 200 }),
        hit({ fdcId: 2, description: 'Garlic, cooked', kcalPer100g: 140 }),
        hit({ fdcId: 3, description: 'Garlic, raw', kcalPer100g: 149 }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toHaveLength(1);
    expect(response.ingredients[0]).toEqual({
      name: 'Garlic',
      grams: 10,
      kcal: 14.9,
      matchedDescription: 'Garlic, raw',
    });
  });

  it('NUT-8 repeats the search once with the plain name when no strict hit survives', async () => {
    const harness = makeHarness(
      version([{ quantity: 100, unit: 'g', name: 'Plum Tomatoes' }], 2),
    );
    searchReturns(harness, {
      '+plum +tomatoes raw': [hit({ description: 'Plum, raw', kcalPer100g: 46 })],
      'Plum Tomatoes': [
        hit({ description: 'Plum, raw', kcalPer100g: 46 }),
        hit({ description: 'Tomatoes, raw', kcalPer100g: 18 }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toEqual([
      ['+plum +tomatoes raw', INGREDIENT_DATA_TYPES],
      ['Plum Tomatoes', INGREDIENT_DATA_TYPES],
    ]);
    expect(response.ingredients[0].matchedDescription).toBe('Tomatoes, raw');
    expect(response.ingredients[0].kcal).toBe(18);
  });

  it('NUT-5 leaves the ingredient unmatched when neither search leaves a hit', async () => {
    const harness = makeHarness(
      version([{ quantity: 100, unit: 'g', name: 'Plain Flour' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ description: 'Snacks, pretzels, hard, plain, made with enriched flour' }),
    ]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)).toHaveLength(2);
    expect(response.ingredients[0]).toEqual({
      name: 'Plain Flour',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    expect(response.partial).toBe(true);
  });
});

describe('NutritionService.compute piece portions (NUT-9)', () => {
  it('NUT-9 weighs "4 Cloves Crushed" garlic with the FNDDS "1 clove" portion (3 g)', async () => {
    const harness = makeHarness(
      version(
        [{ quantity: 4, unit: 'piece', name: 'Garlic', note: 'Cloves Crushed' }],
        2,
      ),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2709786,
        description: 'Garlic, raw',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 143,
      }),
    ]);
    harness.usda.getFood.mockResolvedValue(
      detail(2709786, 'Garlic, raw', [
        { gramWeight: 136, description: '1 cup', amount: null, sequenceNumber: 1 },
        { gramWeight: 3, description: '1 clove', amount: null, sequenceNumber: 2 },
      ]),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.getFood).toHaveBeenCalledWith(2709786);
    // 4 × 3 g = 12 g; 143 × 12 / 100 = 17.16 → 17.2
    expect(response.ingredients[0].grams).toBe(12);
    expect(response.ingredients[0].kcal).toBe(17.2);
  });

  it('NUT-9 divides an SR Legacy `modifier` portion by its amount ("cloves", 3, 9 g)', async () => {
    const harness = makeHarness(
      version([{ quantity: 2, unit: 'piece', name: 'Garlic', note: 'cloves' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 169230, description: 'Garlic, raw', kcalPer100g: 149 }),
    ]);
    harness.usda.getFood.mockResolvedValue(
      detail(169230, 'Garlic, raw', [
        { gramWeight: 136, description: 'cup', amount: 1, sequenceNumber: 1 },
        { gramWeight: 9, description: 'cloves', amount: 3, sequenceNumber: 2 },
      ]),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 2 × (9 g ÷ 3) = 6 g; 149 × 6 / 100 = 8.94 → 8.9
    expect(response.ingredients[0].grams).toBe(6);
    expect(response.ingredients[0].kcal).toBe(8.9);
  });

  it('NUT-5 leaves a `piece` ingredient unavailable when no portion qualifies', async () => {
    const harness = makeHarness(
      version([{ quantity: 2, unit: 'piece', name: 'Carrots' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 170393, description: 'Carrots, raw', kcalPer100g: 41 }),
    ]);
    harness.usda.getFood.mockResolvedValue(
      detail(170393, 'Carrots, raw', [
        { gramWeight: 128, description: 'cup chopped', amount: 1, sequenceNumber: 1 },
      ]),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0].grams).toBeNull();
    expect(response.ingredients[0].kcal).toBeNull();
    expect(response.partial).toBe(true);
  });

  it('NUT-5 leaves a `piece` ingredient unavailable when the food detail is missing', async () => {
    const harness = makeHarness(
      version([{ quantity: 2, unit: 'piece', name: 'Carrots' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 170393, description: 'Carrots, raw', kcalPer100g: 41 }),
    ]);
    harness.usda.getFood.mockResolvedValue(null);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0].kcal).toBeNull();
    expect(response.partial).toBe(true);
  });
});

describe('NutritionService.compute weight notes (NUT-10)', () => {
  it('NUT-10 counts a `none` ingredient noted "1 lb" as 453.59237 g', async () => {
    const harness = makeHarness(
      version(
        [{ quantity: null, unit: 'none', name: 'Ground Beef', note: '1 lb' }],
        4,
      ),
    );
    // Only the ingredient query answers, so the NUT-11 meal lookup finds no dish.
    searchReturns(harness, {
      '+ground +beef raw': [
        hit({ fdcId: 174036, description: 'Beef, ground, raw', kcalPer100g: 254 }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.searchFoods).toHaveBeenCalledWith(
      '+ground +beef raw',
      INGREDIENT_DATA_TYPES,
    );
    expect(harness.usda.getFood).not.toHaveBeenCalled();
    // 254 × 453.59237 / 100 = 1152.1246… → 1152.1
    expect(response.ingredients[0]).toEqual({
      name: 'Ground Beef',
      grams: 453.59,
      kcal: 1152.1,
      matchedDescription: 'Beef, ground, raw',
    });
    expect(response.partial).toBe(false);
  });

  it('NUT-10 counts a `none` ingredient noted "4 oz" as 4 × 28.349523125 g', async () => {
    const harness = makeHarness(
      version(
        [{ quantity: null, unit: 'none', name: 'Cheddar Cheese', note: '4 oz' }],
        2,
      ),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ description: 'Cheese, cheddar', kcalPer100g: 403 }),
    ]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 113.3980925 g; 403 × 113.3980925 / 100 = 456.99… → 457
    expect(response.ingredients[0].grams).toBe(113.4);
    expect(response.ingredients[0].kcal).toBe(457);
  });
});

describe('NutritionService.compute meal mode (NUT-3, NUT-6)', () => {
  it('NUT-6 searches the recipe title in Survey (FNDDS) only', async () => {
    const harness = makeHarness(version([], 4, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([]);

    await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(harness.usda.searchFoods).toHaveBeenCalledWith('Lasagna with meat', [
      'Survey (FNDDS)',
    ]);
  });

  it('NUT-6 returns the matched description and kcal per portion of the first hit', async () => {
    const harness = makeHarness(version([], 4, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: 250,
      }),
    ]);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.mode).toBe('meal');
    expect(response.matchedDescription).toBe('Lasagna with meat');
    // 139 kcal/100 g × 250 g / 100 = 347.5 → 348 per portion
    expect(response.kcalPerPortion).toBe(348);
    expect(response.kcalTotal).toBe(1392);
    expect(response.partial).toBe(false);
    expect(harness.usda.getFood).not.toHaveBeenCalled();
  });

  it('NUT-6 falls back to the first foodPortions gramWeight when the hit has no measure', async () => {
    const harness = makeHarness(version([], 2, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: null,
      }),
    ]);
    harness.usda.getFood.mockResolvedValue({
      fdcId: 2341573,
      description: 'Lasagna with meat',
      kcalPer100g: 139,
      portions: [
        { gramWeight: 200, description: '1 cup', amount: null, sequenceNumber: 1 },
      ],
    } as UsdaFoodDetail);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(harness.usda.getFood).toHaveBeenCalledWith(2341573);
    expect(response.kcalPerPortion).toBe(278);
  });

  it('NUT-6 shows only the kcal/100 g basis when no portion weight exists', async () => {
    const harness = makeHarness(version([], 2, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: null,
      }),
    ]);
    harness.usda.getFood.mockResolvedValue(null);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.kcalPerPortion).toBeNull();
    expect(response.kcalTotal).toBeNull();
    expect(response.partial).toBe(true);
    expect(response.ingredients).toEqual([
      {
        name: 'Lasagna with meat',
        grams: 100,
        kcal: 139,
        matchedDescription: 'Lasagna with meat',
      },
    ]);
  });

  it('NUT-5 returns everything null when the title matches no FNDDS dish', async () => {
    const harness = makeHarness(version([], 3, 'Grandmother surprise'));
    harness.usda.searchFoods.mockResolvedValue([]);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response).toEqual({
      mode: 'meal',
      servings: 3,
      kcalPerPortion: null,
      kcalTotal: null,
      partial: true,
      ingredients: [],
      matchedDescription: null,
      source: 'USDA FoodData Central',
      estimate: null,
    });
  });
});

describe('NutritionService.compute estimate (NUT-11)', () => {
  const TITLE = 'Lasagna with meat';

  /** 200 g egg noodles at 384 kcal/100 g: 768 kcal, 384 per portion over 2. */
  const NOODLES: Ingredient = { quantity: 200, unit: 'g', name: 'egg noodles' };
  /** No USDA hit in these tables, so it stays unavailable. */
  const FLOUR: Ingredient = { quantity: 100, unit: 'g', name: 'Plain Flour' };
  const SALT: Ingredient = { quantity: null, unit: 'none', name: 'Sea Salt' };

  const NOODLE_HITS = { '+egg +noodles raw': [hit({ kcalPer100g: 384 })] };
  /** 139 kcal/100 g × 250 g = 347.5 → 348 kcal per portion. */
  const MEAL_HITS = {
    [TITLE]: [
      hit({
        fdcId: 2341573,
        description: TITLE,
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: 250,
      }),
    ],
  };

  it('NUT-11 looks up the meal name too when ingredients mode is asked', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, { ...NOODLE_HITS, ...MEAL_HITS });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(mealSearches(harness)).toEqual([[TITLE, MEAL_DATA_TYPES]]);
    expect(response.mode).toBe('ingredients');
    expect(response.kcalPerPortion).toBe(384);
    expect(response.ingredients.map((row) => row.name)).toEqual([
      'egg noodles',
    ]);
  });

  it('NUT-11 looks up the ingredients too when meal mode is asked', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, { ...NOODLE_HITS, ...MEAL_HITS });

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(ingredientSearches(harness)).toEqual([
      ['+egg +noodles raw', INGREDIENT_DATA_TYPES],
    ]);
    expect(response.mode).toBe('meal');
    expect(response.kcalPerPortion).toBe(348);
    expect(response.ingredients.map((row) => row.name)).toEqual([TITLE]);
  });

  it.each(['ingredients', 'meal'] as const)(
    'NUT-11 both values available (%s asked): low the smaller, high the larger, rounded to 10, not "at least"',
    async (mode) => {
      const harness = makeHarness(version([NOODLES], 2, TITLE));
      searchReturns(harness, { ...NOODLE_HITS, ...MEAL_HITS });

      const response = await harness.service.compute(USER, RECIPE_ID, mode);

      // meal 348 → 350, ingredients 384 → 380
      expect(response.estimate).toEqual({
        lowKcalPerPortion: 350,
        highKcalPerPortion: 380,
        atLeast: false,
        notCounted: [],
      });
    },
  );

  it('NUT-11 both values available with a partial ingredients value: still not "at least", unmatched names listed', async () => {
    const harness = makeHarness(version([NOODLES, FLOUR, SALT], 2, TITLE));
    searchReturns(harness, { ...NOODLE_HITS, ...MEAL_HITS });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.partial).toBe(true);
    expect(response.estimate).toEqual({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 380,
      atLeast: false,
      notCounted: ['Plain Flour'],
    });
  });

  it('NUT-11 only a partial ingredients value: low = high = it, "at least"', async () => {
    const harness = makeHarness(version([NOODLES, FLOUR], 2, TITLE));
    searchReturns(harness, NOODLE_HITS);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.estimate).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: true,
      notCounted: ['Plain Flour'],
    });
  });

  it('NUT-11 only a complete ingredients value: low = high = it, not "at least"', async () => {
    const harness = makeHarness(version([NOODLES, SALT], 2, TITLE));
    searchReturns(harness, NOODLE_HITS);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.estimate).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 only the meal value: low = high = it, not "at least", unavailable ingredients named', async () => {
    const harness = makeHarness(version([FLOUR], 2, TITLE));
    searchReturns(harness, MEAL_HITS);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.estimate).toEqual({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 350,
      atLeast: false,
      notCounted: ['Plain Flour'],
    });
  });

  it.each(['ingredients', 'meal'] as const)(
    'NUT-11 neither value available (%s asked): estimate is null',
    async (mode) => {
      const harness = makeHarness(version([FLOUR], 2, TITLE));
      searchReturns(harness, {});

      const response = await harness.service.compute(USER, RECIPE_ID, mode);

      expect(response.estimate).toBeNull();
    },
  );

  it('NUT-11 a meal dish without a portion weight gives no meal value', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...NOODLE_HITS,
      [TITLE]: [
        hit({
          fdcId: 2341573,
          description: TITLE,
          dataType: 'Survey (FNDDS)',
          kcalPer100g: 139,
          gramWeightPerMeasure: null,
        }),
      ],
    });
    harness.usda.getFood.mockResolvedValue(null);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.estimate).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 a USDA outage (503) in the meal lookup, ingredients asked, leaves the meal value out', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...NOODLE_HITS,
      [TITLE]: new ServiceUnavailableException('USDA is unavailable'),
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.kcalPerPortion).toBe(384);
    expect(response.estimate).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 a USDA outage (503) in the ingredient lookups, meal asked, leaves the ingredients value out', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...MEAL_HITS,
      '+egg +noodles raw': new ServiceUnavailableException('USDA is unavailable'),
    });

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.kcalPerPortion).toBe(348);
    expect(response.estimate).toEqual({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 350,
      atLeast: false,
      notCounted: ['egg noodles'],
    });
  });

  it('NUT-11 a USDA outage (503) in the asked meal lookup still fails the request', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...NOODLE_HITS,
      [TITLE]: new ServiceUnavailableException('USDA is unavailable'),
    });

    await expect(
      harness.service.compute(USER, RECIPE_ID, 'meal'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('NUT-11 a USDA rate limit (429) in the meal lookup fails an ingredients request', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...NOODLE_HITS,
      [TITLE]: new HttpException(
        'USDA rate limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    });

    const error = await harness.service
      .compute(USER, RECIPE_ID, 'ingredients')
      .catch((thrown: unknown) => thrown);

    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('NUT-11 a USDA rate limit (429) in the ingredient lookups fails a meal request', async () => {
    const harness = makeHarness(version([NOODLES], 2, TITLE));
    searchReturns(harness, {
      ...MEAL_HITS,
      '+egg +noodles raw': new HttpException(
        'USDA rate limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    });

    const error = await harness.service
      .compute(USER, RECIPE_ID, 'meal')
      .catch((thrown: unknown) => thrown);

    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });
});

describe('NutritionService.compute container words (NUT-8)', () => {
  it('NUT-8 "Garlic cloves" keeps both words in the query but keys the match on garlic', async () => {
    const harness = makeHarness(
      version([{ quantity: 10, unit: 'g', name: 'Garlic cloves' }], 2),
    );
    searchReturns(harness, {
      '+garlic +cloves raw': [
        hit({ fdcId: 1, description: 'Spices, cloves, ground', kcalPer100g: 274 }),
        hit({ fdcId: 2, description: 'Garlic, raw', kcalPer100g: 149 }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(ingredientSearches(harness)[0]).toEqual([
      '+garlic +cloves raw',
      INGREDIENT_DATA_TYPES,
    ]);
    expect(response.ingredients[0]).toEqual({
      name: 'Garlic cloves',
      grams: 10,
      kcal: 14.9,
      matchedDescription: 'Garlic, raw',
    });
  });

  it('NUT-8 leaves the recipe ingredient name unchanged in the response', async () => {
    const harness = makeHarness(
      version([{ quantity: 300, unit: 'g', name: 'Chicken Breasts' }], 2),
    );
    searchReturns(harness, {
      '+chicken +breasts raw': [
        hit({
          fdcId: 171077,
          description: 'Chicken, breast, boneless, skinless, raw',
          kcalPer100g: 120,
        }),
      ],
    });

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0]).toEqual({
      name: 'Chicken Breasts',
      grams: 300,
      kcal: 360,
      matchedDescription: 'Chicken, breast, boneless, skinless, raw',
    });
  });
});

// SPEC §11.7 DOC-4: response classes of feature-nutrition, kept in step with util-contracts.
import { ApiProperty } from '@nestjs/swagger';
import type {
  IngredientNutritionDto,
  NutritionMode,
  NutritionResponse,
} from '@rsn/shared/util-contracts';

/** NUT-5..7: one ingredient; null values are "nutrition data unavailable". */
export class IngredientNutritionResponseDto implements IngredientNutritionDto {
  name!: string;
  grams!: number | null;
  kcal!: number | null;
  matchedDescription!: string | null;
}

/** NUT-1..6: `GET /recipes/:id/nutrition`. */
export class NutritionResponseDto implements NutritionResponse {
  /** NUT-4: `ingredients` by default. */
  mode!: NutritionMode;

  servings!: number;
  kcalPerPortion!: number | null;
  kcalTotal!: number | null;

  /** NUT-6: true when any ingredient is unavailable. */
  partial!: boolean;

  /** NUT-6: one row per ingredient; in meal mode the matched dish, if any. */
  ingredients!: IngredientNutritionResponseDto[];

  /** NUT-6: the matched FNDDS dish in meal mode. */
  matchedDescription!: string | null;

  // DOC-5: a single string literal, which the plugin does not list as a value.
  @ApiProperty({ enum: ['USDA FoodData Central'] })
  source!: 'USDA FoodData Central';
}

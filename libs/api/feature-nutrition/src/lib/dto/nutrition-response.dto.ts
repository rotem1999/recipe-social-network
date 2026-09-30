// SPEC §11.7 DOC-4: response classes of feature-nutrition, kept in step with util-contracts.
import { ApiProperty } from '@nestjs/swagger';
import type {
  IngredientNutritionDto,
  NutritionEstimateDto,
  NutritionMode,
  NutritionResponse,
} from '@rsn/shared/util-contracts';

/** NUT-11: the headline range, each end rounded to the nearest 10 kcal. */
export class NutritionEstimateResponseDto implements NutritionEstimateDto {
  lowKcalPerPortion!: number;
  highKcalPerPortion!: number;

  /** NUT-11: true only when the ingredients value alone is available and partial. */
  atLeast!: boolean;

  /** NUT-11: ingredients the ingredients-mode pass left unavailable; empty when none. */
  notCounted!: string[];
}

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

  /** NUT-11: present whichever `mode` was asked; null when neither value is available. */
  estimate!: NutritionEstimateResponseDto | null;

  // DOC-5: a single string literal, which the plugin does not list as a value.
  @ApiProperty({ enum: ['USDA FoodData Central'] })
  source!: 'USDA FoodData Central';
}

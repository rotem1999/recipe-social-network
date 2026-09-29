// §3.1.1, §11.6: the validated body of `POST /recipes` and `PUT /recipes/:id`.
// class-validator shapes the request; `validateRecipeContent` (util-domain) is run on
// top of it in RecipesService so both layers share one set of invariants.
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CATEGORIES,
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_QUANTITY,
  MAX_PREP_COOK_MINUTES,
  MAX_SERVINGS,
  MAX_STEPS,
  MAX_STEP_DURATION_MINUTES,
  MIN_PREP_COOK_MINUTES,
  MIN_SERVINGS,
  MIN_STEP_DURATION_MINUTES,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  STEP_TEXT_MAX_LENGTH,
  UNITS,
  type Category,
  type Ingredient,
  type Step,
  type Unit,
} from '@rsn/shared/util-domain';
import type { RecipeWriteRequest } from '@rsn/shared/util-contracts';

/** §3.1.1 ingredients[]: `quantity` empty (null) means "to taste". */
export class IngredientDto implements Ingredient {
  // An absent `quantity` stays null, which is the "to taste" case; a present one is
  // above 0 and at most 10000 (§3.1.1 upper limits).
  @ValidateIf((dto: IngredientDto) => dto.quantity !== null)
  @IsNumber()
  @IsPositive()
  @Max(MAX_INGREDIENT_QUANTITY)
  quantity: number | null = null;

  @IsIn([...UNITS])
  unit!: Unit;

  @IsString()
  @IsNotEmpty()
  @MaxLength(INGREDIENT_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(INGREDIENT_NOTE_MAX_LENGTH)
  note?: string;
}

/** §3.1.1 steps[]: `durationMinutes` becomes a cook-mode timer. */
export class StepDto implements Step {
  @IsString()
  @IsNotEmpty()
  @MaxLength(STEP_TEXT_MAX_LENGTH)
  text!: string;

  // Up to 1440 is accepted; cook mode offers a timer only up to 120 (UI-15).
  @IsOptional()
  @IsInt()
  @Min(MIN_STEP_DURATION_MINUTES)
  @Max(MAX_STEP_DURATION_MINUTES)
  durationMinutes?: number;
}

/**
 * §3.1.1: every field a recipe version carries (images are uploaded separately, IMG-3),
 * within the §3.1.1 upper limits (Rotem, chat 2026-09-30); a body outside them is a 400.
 */
export class RecipeWriteDto implements RecipeWriteRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(RECIPE_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RECIPE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  /** DISC-8: exactly one of the 14 categories. */
  @IsIn([...CATEGORIES])
  category!: Category;

  @IsInt()
  @Min(MIN_SERVINGS)
  @Max(MAX_SERVINGS)
  servings!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INGREDIENTS)
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients!: IngredientDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STEPS)
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];

  @IsOptional()
  @IsInt()
  @Min(MIN_PREP_COOK_MINUTES)
  @Max(MAX_PREP_COOK_MINUTES)
  prepMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_PREP_COOK_MINUTES)
  @Max(MAX_PREP_COOK_MINUTES)
  cookMinutes?: number;
}

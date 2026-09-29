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
  // above 0 and at most 10000 (§3.1.1 upper limits). UI-43: UI-31 wording.
  @ValidateIf((dto: IngredientDto) => dto.quantity !== null)
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsPositive({ message: 'Quantity must be more than 0' })
  @Max(MAX_INGREDIENT_QUANTITY, {
    message: `Quantity can be at most ${MAX_INGREDIENT_QUANTITY}`,
  })
  quantity: number | null = null;

  @IsIn([...UNITS], { message: 'Choose a unit' })
  unit!: Unit;

  @IsString({ message: 'Name this ingredient' })
  @IsNotEmpty({ message: 'Name this ingredient' })
  @MaxLength(INGREDIENT_NAME_MAX_LENGTH, {
    message: `Ingredient names can be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`,
  })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Write the note as text' })
  @MaxLength(INGREDIENT_NOTE_MAX_LENGTH, {
    message: `Notes can be at most ${INGREDIENT_NOTE_MAX_LENGTH} characters`,
  })
  note?: string;
}

/** §3.1.1 steps[]: `durationMinutes` becomes a cook-mode timer. */
export class StepDto implements Step {
  // UI-43: UI-31 wording.
  @IsString({ message: 'Write this step' })
  @IsNotEmpty({ message: 'Write this step' })
  @MaxLength(STEP_TEXT_MAX_LENGTH, {
    message: `Steps can be at most ${STEP_TEXT_MAX_LENGTH} characters`,
  })
  text!: string;

  // Up to 1440 is accepted; cook mode offers a timer only up to 120 (UI-15).
  @IsOptional()
  @IsInt({ message: 'Minutes must be a whole number' })
  @Min(MIN_STEP_DURATION_MINUTES, {
    message: `Minutes must be at least ${MIN_STEP_DURATION_MINUTES}`,
  })
  @Max(MAX_STEP_DURATION_MINUTES, {
    message: `Minutes can be at most ${MAX_STEP_DURATION_MINUTES}`,
  })
  durationMinutes?: number;
}

/**
 * §3.1.1: every field a recipe version carries (images are uploaded separately, IMG-3),
 * within the §3.1.1 upper limits (Rotem, chat 2026-09-30); a body outside them is a 400.
 */
export class RecipeWriteDto implements RecipeWriteRequest {
  // UI-43: every message uses the UI-31 wording.
  @IsString({ message: 'Give the recipe a title' })
  @IsNotEmpty({ message: 'Give the recipe a title' })
  @MaxLength(RECIPE_TITLE_MAX_LENGTH, {
    message: `Title can be at most ${RECIPE_TITLE_MAX_LENGTH} characters`,
  })
  title!: string;

  @IsOptional()
  @IsString({ message: 'Write the description as text' })
  @MaxLength(RECIPE_DESCRIPTION_MAX_LENGTH, {
    message: `Description can be at most ${RECIPE_DESCRIPTION_MAX_LENGTH} characters`,
  })
  description?: string;

  /** DISC-8: exactly one of the 14 categories. */
  @IsIn([...CATEGORIES], { message: 'Choose a category' })
  category!: Category;

  @IsInt({ message: 'Servings must be a whole number' })
  @Min(MIN_SERVINGS, { message: `Servings must be at least ${MIN_SERVINGS}` })
  @Max(MAX_SERVINGS, { message: `Servings can be at most ${MAX_SERVINGS}` })
  servings!: number;

  @IsArray({ message: 'Add at least one ingredient' })
  @ArrayMinSize(1, { message: 'Add at least one ingredient' })
  @ArrayMaxSize(MAX_INGREDIENTS, {
    message: `A recipe can have at most ${MAX_INGREDIENTS} ingredients`,
  })
  @ValidateNested({
    each: true,
    message: 'Every ingredient needs a unit and a name',
  })
  @Type(() => IngredientDto)
  ingredients!: IngredientDto[];

  @IsArray({ message: 'Add at least one step' })
  @ArrayMinSize(1, { message: 'Add at least one step' })
  @ArrayMaxSize(MAX_STEPS, {
    message: `A recipe can have at most ${MAX_STEPS} steps`,
  })
  @ValidateNested({ each: true, message: 'Every step needs its text' })
  @Type(() => StepDto)
  steps!: StepDto[];

  @IsOptional()
  @IsInt({ message: 'Prep minutes must be a whole number' })
  @Min(MIN_PREP_COOK_MINUTES, { message: "Prep minutes can't be negative" })
  @Max(MAX_PREP_COOK_MINUTES, {
    message: `Prep minutes can be at most ${MAX_PREP_COOK_MINUTES}`,
  })
  prepMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'Cook minutes must be a whole number' })
  @Min(MIN_PREP_COOK_MINUTES, { message: "Cook minutes can't be negative" })
  @Max(MAX_PREP_COOK_MINUTES, {
    message: `Cook minutes can be at most ${MAX_PREP_COOK_MINUTES}`,
  })
  cookMinutes?: number;
}

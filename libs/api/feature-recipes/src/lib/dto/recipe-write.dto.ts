// §3.1.1, §11.6: the validated body of `POST /recipes` and `PUT /recipes/:id`.
// class-validator shapes the request; `validateRecipeContent` (util-domain) is run on
// top of it in RecipesService so both layers share one set of invariants.
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CATEGORIES,
  UNITS,
  type Category,
  type Ingredient,
  type Step,
  type Unit,
} from '@rsn/shared/util-domain';
import type { RecipeWriteRequest } from '@rsn/shared/util-contracts';

/** §3.1.1 ingredients[]: `quantity` empty (null) means "to taste". */
export class IngredientDto implements Ingredient {
  // An absent `quantity` stays null, which is the "to taste" case.
  @ValidateIf((dto: IngredientDto) => dto.quantity !== null)
  @IsNumber()
  @Min(0)
  quantity: number | null = null;

  @IsIn([...UNITS])
  unit!: Unit;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** §3.1.1 steps[]: `durationMinutes` becomes a cook-mode timer. */
export class StepDto implements Step {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}

/** §3.1.1: every field a recipe version carries (images are uploaded separately, IMG-3). */
export class RecipeWriteDto implements RecipeWriteRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** DISC-8: exactly one of the 14 categories. */
  @IsIn([...CATEGORIES])
  category!: Category;

  @IsInt()
  @Min(1)
  servings!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngredientDto)
  ingredients!: IngredientDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  prepMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cookMinutes?: number;
}

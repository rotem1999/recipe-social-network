// SPEC §11.7 DOC-4: response classes of feature-discover, kept in step with util-contracts.
import {
  IngredientDto,
  RecipeCardResponseDto,
  StepDto,
} from '@rsn/api/feature-recipes';
import type {
  CatalogueItemDto,
  CataloguePreviewDto,
  DiscoverCategoryDto,
  DiscoverResponse,
} from '@rsn/shared/util-contracts';
import type { Category } from '@rsn/shared/util-domain';

/** DISC-4, DISC-9: one TheMealDB catalogue entry (not stored until saved, CAT-3). */
export class CatalogueItemResponseDto implements CatalogueItemDto {
  /** TheMealDB `idMeal`. */
  mealId!: string;

  name!: string;
  thumbnailUrl!: string;
  category!: Category;

  /** DISC-10: the caller's live copy of this meal, or null. */
  myCopyId!: string | null;
}

/** DISC-5, DISC-9: one category of Discover. */
export class DiscoverCategoryResponseDto implements DiscoverCategoryDto {
  category!: Category;

  /** DISC-6: one of the caller's pinned favourites. */
  isFavourite!: boolean;

  /** DISC-9: public user recipes, newest first. */
  recipes!: RecipeCardResponseDto[];

  /** DISC-9: TheMealDB entries of the category, after the user recipes. */
  catalogue!: CatalogueItemResponseDto[];

  page!: number;
  hasMore!: boolean;
}

/** DISC-9: `GET /discover`. */
export class DiscoverResponseDto implements DiscoverResponse {
  categories!: DiscoverCategoryResponseDto[];

  /** §3.3: the TheMealDB attribution string. */
  attribution!: string;
}

/** CAT-2, DISC-10: `GET /discover/catalogue/:mealId`, the live preview of one meal. */
export class CataloguePreviewResponseDto implements CataloguePreviewDto {
  title!: string;
  description?: string;
  category!: Category;
  servings!: number;
  ingredients!: IngredientDto[];
  steps!: StepDto[];
  prepMinutes?: number;
  cookMinutes?: number;

  /** TheMealDB `idMeal`. */
  mealId!: string;

  thumbnailUrl!: string;
  area!: string | null;

  /** §3.3: the TheMealDB attribution string. */
  attribution!: string;

  /** DISC-10: the caller's live copy of this meal, or null. */
  myCopyId!: string | null;
}

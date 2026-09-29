// SPEC §11.7 DOC-4: response classes of feature-recipes, kept in step with util-contracts.
// The recipe card and the rating summary live here because feature-discover,
// feature-recommend and feature-social all return them and import feature-recipes.
import type {
  ImageUploadResponse,
  RatingSummaryDto,
  RecipeAttributionDto,
  RecipeCardDto,
  RecipeDetailDto,
  RecipeListResponse,
  RecipeVersionSummaryDto,
  RecipeVersionsResponse,
} from '@rsn/shared/util-contracts';
import type {
  Category,
  RecipeRelation,
  RecipeSource,
  Visibility,
} from '@rsn/shared/util-domain';
import { IngredientDto, StepDto } from './recipe-write.dto';

/** RATE-2..4: the stored average and count, and the caller's own grade. */
export class RatingSummaryResponseDto implements RatingSummaryDto {
  /** RATE-2: 1.00–5.00 with two decimals; null before the first grade. */
  average!: number | null;

  count!: number;

  /** RATE-4: the caller's whole-star grade, or null. */
  mine!: number | null;
}

/**
 * SAVE-9: the source of a copy. `recipeId` is set only while the caller can still view
 * the source; a TheMealDB source has `source: themealdb`, the meal name as `title` and
 * no owner.
 */
export class RecipeAttributionResponseDto implements RecipeAttributionDto {
  recipeId!: string | null;
  title!: string;
  ownerUsername!: string | null;
  source!: RecipeSource;
}

/** §11.6: a recipe on the Home and Discover cards. */
export class RecipeCardResponseDto implements RecipeCardDto {
  id!: string;
  title!: string;

  /** DISC-7, DISC-8: one of the 14 categories. */
  category!: Category;

  servings!: number;
  prepMinutes?: number;
  cookMinutes?: number;
  visibility!: Visibility;

  /** SAVE-7: how the caller relates to the recipe. */
  relation!: RecipeRelation;

  ownerUsername!: string;
  source!: RecipeSource;

  /** IMG-4: a short-lived signed URL, or null. */
  imageUrl!: string | null;

  /** RATE-2: null on private and shared recipes. */
  rating!: RatingSummaryResponseDto | null;

  versionNumber!: number;
  updatedAt!: string;

  /** DISC-10: on someone else's recipe, the caller's live copy of it; otherwise null. */
  myCopyId!: string | null;

  /** SAVE-10: the caller's copy (this recipe, or `myCopyId`) is behind its source. */
  updateAvailable!: boolean;
}

/** REC-4: one version of a recipe with the caller's permissions on it. */
export class RecipeDetailResponseDto
  extends RecipeCardResponseDto
  implements RecipeDetailDto
{
  description?: string;
  ingredients!: IngredientDto[];
  steps!: StepDto[];

  /** IMG-4: short-lived signed URLs. */
  imageUrls!: string[];

  /** SAVE-2, COOK-5. */
  canCook!: boolean;

  /** REC-6. */
  canEdit!: boolean;

  /** RATE-1: public recipes only. */
  canRate!: boolean;

  /** COM-1: public and shared recipes. */
  hasComments!: boolean;

  /** COM-2: public recipes only. */
  hasVotes!: boolean;

  versionCount!: number;

  /** SAVE-6, SAVE-9: set once a copy is a fork. */
  forkedFrom!: RecipeAttributionResponseDto | null;

  /** SAVE-9: set while a copy is a saved copy. */
  savedFrom!: RecipeAttributionResponseDto | null;

  /** REC-2: the friends a shared recipe is shared with. */
  sharedWithUserIds!: string[];

  /** §3.3: the TheMealDB attribution string on catalogue content, else null. */
  attribution!: string | null;
}

/** REC-7: one entry of the version history. */
export class RecipeVersionSummaryResponseDto implements RecipeVersionSummaryDto {
  versionNumber!: number;
  title!: string;
  createdAt!: string;
  isCurrent!: boolean;
}

/** REC-7: `GET /recipes/:id/versions`. */
export class RecipeVersionsResponseDto implements RecipeVersionsResponse {
  versions!: RecipeVersionSummaryResponseDto[];
}

/** SAVE-3: `GET /recipes`. */
export class RecipeListResponseDto implements RecipeListResponse {
  recipes!: RecipeCardResponseDto[];
}

/** IMG-3, IMG-6: the current version's signed image URLs after an upload or delete. */
export class ImageUploadResponseDto implements ImageUploadResponse {
  imageUrls!: string[];
}

// CAT-6 (§3.3): the injectable face of the pure mappers in mapper.ts, so feature
// libraries can inject the mapper instead of importing functions.

import { Injectable } from '@nestjs/common';
import { Category, RecipeContent } from '@rsn/shared/util-domain';
import {
  CatalogueItemDto,
  CataloguePreviewDto,
} from '@rsn/shared/util-contracts';
import { MealFilterRow, MealRecord } from './meal-record';
import { toCatalogueItem, toCataloguePreview, toRecipeContent } from './mapper';

@Injectable()
export class TheMealDbMapper {
  /** CAT-4, CAT-5, CAT-6. */
  toRecipeContent(meal: MealRecord): RecipeContent {
    return toRecipeContent(meal);
  }

  /** CAT-6, DISC-9. */
  toCatalogueItem(row: MealFilterRow, category: Category): CatalogueItemDto {
    return toCatalogueItem(row, category);
  }

  /** CAT-2, CAT-6. */
  toCataloguePreview(meal: MealRecord): CataloguePreviewDto {
    return toCataloguePreview(meal);
  }
}

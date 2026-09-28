import { Matches } from 'class-validator';

/** §11.6 `GET /discover/catalogue/:mealId` path parameters — CAT-2. */
export class CataloguePreviewParamsDto {
  /** CAT-6: TheMealDB ids are decimal digits (`idMeal`). */
  @Matches(/^\d+$/)
  mealId!: string;
}

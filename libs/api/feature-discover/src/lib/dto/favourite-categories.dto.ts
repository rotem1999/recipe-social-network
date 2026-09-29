import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';
import {
  CATEGORIES,
  MAX_FAVOURITE_CATEGORIES,
  type Category,
} from '@rsn/shared/util-domain';
import type { FavouriteCategoriesRequest } from '@rsn/shared/util-contracts';

/** §11.6 `PUT /me/favourite-categories` body — DISC-6 (at most 3), DISC-9. */
export class FavouriteCategoriesDto implements FavouriteCategoriesRequest {
  @IsArray()
  @ArrayMaxSize(MAX_FAVOURITE_CATEGORIES)
  @IsIn(CATEGORIES, { each: true })
  categories!: Category[];
}

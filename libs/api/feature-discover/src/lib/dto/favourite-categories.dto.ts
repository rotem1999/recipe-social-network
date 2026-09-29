import { ArrayMaxSize, IsArray, IsIn } from 'class-validator';
import {
  CATEGORIES,
  MAX_FAVOURITE_CATEGORIES,
  type Category,
} from '@rsn/shared/util-domain';
import type { FavouriteCategoriesRequest } from '@rsn/shared/util-contracts';

/** §11.6 `PUT /me/favourite-categories` body — DISC-6 (at most 3), DISC-9. */
export class FavouriteCategoriesDto implements FavouriteCategoriesRequest {
  // UI-43: messages written for people.
  @IsArray({ message: 'Choose your favourite categories' })
  @ArrayMaxSize(MAX_FAVOURITE_CATEGORIES, {
    message: `You can favourite at most ${MAX_FAVOURITE_CATEGORIES} categories`,
  })
  @IsIn(CATEGORIES, { each: true, message: 'Choose one of the categories' })
  categories!: Category[];
}

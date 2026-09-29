// §3.3 / §16 M7: the raw shapes TheMealDB returns. Nothing here is a domain type;
// the mapper (CAT-6) turns these into @rsn/shared types.

/** The 20 ingredient/measure slots every meal object carries (§16 M7). */
export type MealSlot =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

/** §3.3: unused slots are `""` on some fields and `null` on others (§16 M7, meal 52772). */
export type MealIngredientSlots = {
  [K in `strIngredient${MealSlot}`]?: string | null;
};
export type MealMeasureSlots = {
  [K in `strMeasure${MealSlot}`]?: string | null;
};

/** §16 M7: the named fields of the meal object this library uses. */
export interface MealRecordFields {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strSource?: string | null;
  strYoutube?: string | null;
  dateModified?: string | null;
}

/**
 * A `lookup.php` meal row. Indexable so the mapper can walk `strIngredient1..20`
 * and `strMeasure1..20` by slot number (CAT-6).
 */
export type MealRecord = MealRecordFields &
  MealIngredientSlots &
  MealMeasureSlots & {
    [key: string]: string | null | undefined;
  };

/** CAT-6: `filter.php?c=<category>` returns id, name and thumbnail only. */
export interface MealFilterRow {
  idMeal: string;
  strMeal: string;
  strMealThumb?: string | null;
}

/** DISC-7: `list.php?c=list` rows. */
export interface MealCategoryRow {
  strCategory?: string | null;
}

/** The number of ingredient/measure slots on a meal object (§16 M7). */
export const MEAL_SLOT_COUNT = 20;

// SPEC §9 NUT-11: the headline range between the two NUT-3 estimates.
import type { NutritionEstimateDto } from '@rsn/shared/util-contracts';

/** NUT-11: numbers are rounded to the nearest 10 kcal (Rotem delegated, chat 2026-09-30). */
export function roundToTen(kcal: number): number {
  return Math.round(kcal / 10) * 10;
}

/** The per-portion value of one mode; `kcalPerPortion` null means unavailable. */
export interface ModeValue {
  kcalPerPortion: number | null;
  partial: boolean;
  /** The mode's rows; an ingredients row with `kcal` null was left unavailable. */
  ingredients: readonly { name: string; kcal: number | null }[];
}

/** NUT-11 `notCounted`: the ingredients the ingredients-mode pass left unavailable. */
function notCountedIn(ingredients: ModeValue | null): string[] {
  return (ingredients?.ingredients ?? [])
    .filter((row) => row.kcal === null)
    .map((row) => row.name);
}

/**
 * NUT-11: both values available → low the smaller, high the larger, `atLeast` false;
 * only the ingredients value → low = high = it, `atLeast` when it is partial (NUT-6);
 * only the meal value → low = high = it, `atLeast` false; neither → null.
 * `notCounted` lists the ingredients-mode rows left unavailable, whichever mode was asked.
 * A mode that could not be computed is passed as null.
 */
export function estimateFrom(
  ingredients: ModeValue | null,
  meal: ModeValue | null,
): NutritionEstimateDto | null {
  const fromIngredients = ingredients?.kcalPerPortion ?? null;
  const fromMeal = meal?.kcalPerPortion ?? null;
  const notCounted = notCountedIn(ingredients);

  if (fromIngredients !== null && fromMeal !== null) {
    return {
      lowKcalPerPortion: roundToTen(Math.min(fromIngredients, fromMeal)),
      highKcalPerPortion: roundToTen(Math.max(fromIngredients, fromMeal)),
      atLeast: false,
      notCounted,
    };
  }
  if (fromIngredients !== null) {
    const value = roundToTen(fromIngredients);
    return {
      lowKcalPerPortion: value,
      highKcalPerPortion: value,
      atLeast: ingredients?.partial ?? false,
      notCounted,
    };
  }
  if (fromMeal !== null) {
    const value = roundToTen(fromMeal);
    return {
      lowKcalPerPortion: value,
      highKcalPerPortion: value,
      atLeast: false,
      notCounted,
    };
  }
  return null;
}

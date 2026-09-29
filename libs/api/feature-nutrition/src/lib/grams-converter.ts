import type { Ingredient, Unit } from '@rsn/shared/util-domain';

/**
 * NUT-6 unit table: grams contributed by one unit of quantity. Volumes use
 * density 1 (`ml` as is, `l` ×1000, `tsp` 5 ml, `tbsp` 15 ml, `cup` 240 ml).
 * `piece` is absent: it needs the food's own portion weight. `none` is absent:
 * it is unmatched.
 */
const GRAMS_PER_UNIT: Readonly<
  Record<Exclude<Unit, 'piece' | 'none'>, number>
> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  pinch: 0.3,
};

/**
 * NUT-6: grams for one ingredient. `portionGramWeight` is the food's first
 * `foodPortions[].gramWeight` and is only read for the `piece` unit. Returns
 * null when the quantity is empty ("to taste"), when the unit is `none`, or
 * when a `piece` quantity has no portion weight — all unmatched (NUT-5).
 */
export function gramsFor(
  ingredient: Ingredient,
  portionGramWeight: number | null,
): number | null {
  const { quantity, unit } = ingredient;
  if (quantity === null || !Number.isFinite(quantity)) {
    return null;
  }
  if (unit === 'none') {
    return null;
  }
  if (unit === 'piece') {
    return portionGramWeight === null ? null : quantity * portionGramWeight;
  }
  return quantity * GRAMS_PER_UNIT[unit];
}

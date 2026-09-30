// SPEC §9 NUT-6: the full unit table. Pure function, no I/O.
import type { Ingredient, Unit } from '@rsn/shared/util-domain';

import { gramsFor } from './grams-converter';

function ingredient(quantity: number | null, unit: Unit): Ingredient {
  return { quantity, unit, name: 'flour' };
}

describe('gramsFor (NUT-6)', () => {
  it('NUT-6 takes `g` as is', () => {
    expect(gramsFor(ingredient(250, 'g'), null)).toBe(250);
  });

  it('NUT-6 multiplies `kg` by 1000', () => {
    expect(gramsFor(ingredient(1.5, 'kg'), null)).toBe(1500);
  });

  it('NUT-6 takes `ml` as is (density 1)', () => {
    expect(gramsFor(ingredient(300, 'ml'), null)).toBe(300);
  });

  it('NUT-6 multiplies `l` by 1000 (density 1)', () => {
    expect(gramsFor(ingredient(2, 'l'), null)).toBe(2000);
  });

  it('NUT-6 counts `tsp` as 5 ml', () => {
    expect(gramsFor(ingredient(3, 'tsp'), null)).toBe(15);
  });

  it('NUT-6 counts `tbsp` as 15 ml', () => {
    expect(gramsFor(ingredient(2, 'tbsp'), null)).toBe(30);
  });

  it('NUT-6 counts `cup` as 240 ml', () => {
    expect(gramsFor(ingredient(2, 'cup'), null)).toBe(480);
  });

  it('NUT-6 counts `pinch` as 0.3 g', () => {
    expect(gramsFor(ingredient(1, 'pinch'), null)).toBe(0.3);
  });

  it('NUT-6 uses the food portion weight for `piece`', () => {
    expect(gramsFor(ingredient(3, 'piece'), 50)).toBe(150);
  });

  it('NUT-6 leaves `piece` unmatched when the food carries no portion weight', () => {
    expect(gramsFor(ingredient(3, 'piece'), null)).toBeNull();
  });

  it('NUT-6 leaves the `none` unit unmatched', () => {
    expect(gramsFor(ingredient(2, 'none'), null)).toBeNull();
  });

  it('NUT-6 leaves an empty quantity ("to taste") unmatched, whatever the unit', () => {
    expect(gramsFor(ingredient(null, 'g'), null)).toBeNull();
    expect(gramsFor(ingredient(null, 'piece'), 50)).toBeNull();
    expect(gramsFor(ingredient(null, 'none'), null)).toBeNull();
  });

  it('NUT-6 leaves a non-finite quantity unmatched', () => {
    expect(gramsFor(ingredient(Number.NaN, 'g'), null)).toBeNull();
    expect(gramsFor(ingredient(Number.POSITIVE_INFINITY, 'g'), null)).toBeNull();
  });

  it('NUT-6 ignores the portion weight for every unit but `piece`, `cup`, `tbsp` and `tsp`', () => {
    expect(gramsFor(ingredient(2, 'g'), 500)).toBe(2);
    expect(gramsFor(ingredient(2, 'kg'), 500)).toBe(2000);
    expect(gramsFor(ingredient(2, 'ml'), 500)).toBe(2);
    expect(gramsFor(ingredient(2, 'l'), 500)).toBe(2000);
    expect(gramsFor(ingredient(2, 'pinch'), 500)).toBe(0.6);
    expect(gramsFor(ingredient(2, 'none'), 500)).toBeNull();
  });

  it('NUT-6 weighs `cup` by the food own cup portion when given (3 cups × 185 g)', () => {
    expect(gramsFor(ingredient(3, 'cup'), 185)).toBe(555);
  });

  it('NUT-6 weighs `tbsp` by the food own tablespoon portion when given', () => {
    expect(gramsFor(ingredient(2, 'tbsp'), 8)).toBe(16);
  });

  it('NUT-6 weighs `tsp` by the food own teaspoon portion when given', () => {
    expect(gramsFor(ingredient(1.5, 'tsp'), 4)).toBe(6);
  });

  it('NUT-6 falls back to water density for `cup`, `tbsp` and `tsp` when no portion weight is given', () => {
    expect(gramsFor(ingredient(1, 'cup'), null)).toBe(240);
    expect(gramsFor(ingredient(1, 'tbsp'), null)).toBe(15);
    expect(gramsFor(ingredient(1, 'tsp'), null)).toBe(5);
  });

  it('NUT-6 leaves an empty `cup` quantity unmatched even with a portion weight', () => {
    expect(gramsFor(ingredient(null, 'cup'), 185)).toBeNull();
  });
});

// SPEC §9 NUT-11: the headline range between the two NUT-3 estimates. Pure
// functions, no I/O.
import type { ModeValue } from './nutrition-estimate';
import { estimateFrom, roundToTen } from './nutrition-estimate';

function ingredientsValue(
  kcalPerPortion: number | null,
  rows: ModeValue['ingredients'] = [],
): ModeValue {
  return {
    kcalPerPortion,
    partial: rows.some((row) => row.kcal === null),
    ingredients: rows,
  };
}

function mealValue(kcalPerPortion: number | null): ModeValue {
  return {
    kcalPerPortion,
    partial: kcalPerPortion === null,
    ingredients: [{ name: 'Lasagna with meat', kcal: 139 }],
  };
}

describe('roundToTen (NUT-11)', () => {
  it('NUT-11 rounds to the nearest 10 kcal', () => {
    expect(roundToTen(0)).toBe(0);
    expect(roundToTen(4)).toBe(0);
    expect(roundToTen(6)).toBe(10);
    expect(roundToTen(244)).toBe(240);
    expect(roundToTen(246)).toBe(250);
    expect(roundToTen(1594.9)).toBe(1590);
    expect(roundToTen(800)).toBe(800);
  });
});

describe('estimateFrom (NUT-11)', () => {
  it('NUT-11 both available: low the smaller, high the larger, not "at least"', () => {
    expect(estimateFrom(ingredientsValue(796), mealValue(242))).toEqual({
      lowKcalPerPortion: 240,
      highKcalPerPortion: 800,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 both available: the order does not depend on which mode is larger', () => {
    expect(estimateFrom(ingredientsValue(242), mealValue(796))).toEqual({
      lowKcalPerPortion: 240,
      highKcalPerPortion: 800,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 both available and rounding to the same 10 kcal: low equals high', () => {
    expect(estimateFrom(ingredientsValue(352), mealValue(348))).toMatchObject({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 350,
    });
  });

  it('NUT-11 both available with a partial ingredients value: not "at least", unmatched names listed', () => {
    const ingredients = ingredientsValue(400, [
      { name: 'egg noodles', kcal: 768 },
      { name: 'chicken breasts', kcal: null },
      { name: 'Sea Salt', kcal: 0 },
      { name: 'stir-fry vegetables', kcal: null },
    ]);

    expect(estimateFrom(ingredients, mealValue(240))).toEqual({
      lowKcalPerPortion: 240,
      highKcalPerPortion: 400,
      atLeast: false,
      notCounted: ['chicken breasts', 'stir-fry vegetables'],
    });
  });

  it('NUT-11 only the ingredients value, partial: low = high = it, "at least"', () => {
    const ingredients = ingredientsValue(384, [
      { name: 'egg noodles', kcal: 768 },
      { name: 'Plain Flour', kcal: null },
    ]);

    expect(estimateFrom(ingredients, mealValue(null))).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: true,
      notCounted: ['Plain Flour'],
    });
  });

  it('NUT-11 only the ingredients value, complete: not "at least"', () => {
    const ingredients = ingredientsValue(384, [
      { name: 'egg noodles', kcal: 768 },
    ]);

    expect(estimateFrom(ingredients, null)).toEqual({
      lowKcalPerPortion: 380,
      highKcalPerPortion: 380,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 only the meal value: low = high = it, not "at least"', () => {
    const ingredients = ingredientsValue(null, [
      { name: 'Plain Flour', kcal: null },
    ]);

    expect(estimateFrom(ingredients, mealValue(348))).toEqual({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 350,
      atLeast: false,
      notCounted: ['Plain Flour'],
    });
  });

  it('NUT-11 only the meal value with the ingredients mode left out (503): nothing listed as not counted', () => {
    expect(estimateFrom(null, mealValue(348))).toEqual({
      lowKcalPerPortion: 350,
      highKcalPerPortion: 350,
      atLeast: false,
      notCounted: [],
    });
  });

  it('NUT-11 neither value available: null', () => {
    expect(estimateFrom(ingredientsValue(null), mealValue(null))).toBeNull();
    expect(estimateFrom(null, null)).toBeNull();
    expect(estimateFrom(null, mealValue(null))).toBeNull();
  });

  it('NUT-11 the meal rows never count as "not counted"', () => {
    const meal: ModeValue = {
      kcalPerPortion: 300,
      partial: false,
      ingredients: [{ name: 'Lasagna with meat', kcal: null }],
    };

    expect(estimateFrom(ingredientsValue(500), meal)?.notCounted).toEqual([]);
  });
});

// SPEC §9 NUT-9 (§16 U11, U14, U15): the weight of one piece of a food, from its
// USDA portions. Pure function, no I/O; portions use the client's §9 shape.
import type { UsdaFoodPortion } from '@rsn/api/data-access-usda';

import {
  isHouseholdMeasure,
  pickMeasureGrams,
  pickPieceGrams,
} from './portion-picker';

/** FNDDS: the text is `portionDescription`, `amount` undefined (client gives null). */
function fndds(
  description: string,
  gramWeight: number,
  sequenceNumber: number | null = null,
): UsdaFoodPortion {
  return { description, gramWeight, amount: null, sequenceNumber };
}

/**
 * SR Legacy / Foundation: no `portionDescription`, so the text is `modifier`
 * or the Foundation unit alone, and the count is `amount` (NUT-9, §16 U15).
 */
function srLegacy(
  description: string,
  amount: number | null,
  gramWeight: number,
  sequenceNumber: number | null = null,
): UsdaFoodPortion {
  return { description, gramWeight, amount, sequenceNumber };
}

describe('pickPieceGrams (NUT-9)', () => {
  it('NUT-9 finds the FNDDS "1 clove" (3 g) for garlic with the note "Cloves Crushed" (§16 U11 2709786)', () => {
    const portions = [
      fndds('1 cup', 136, 1),
      fndds('1 tsp', 3, 2),
      fndds('1 clove', 3, 3),
      fndds('Quantity not specified', 3, 4),
    ];
    expect(pickPieceGrams(portions, 'Garlic', 'Cloves Crushed')).toBe(3);
  });

  it('NUT-9 finds "1 clove" from the first word of a note that starts with a number ("4 Cloves Crushed")', () => {
    const portions = [fndds('1 whole bulb', 40, 1), fndds('1 clove', 3, 2)];
    expect(pickPieceGrams(portions, 'Garlic', '4 Cloves Crushed')).toBe(3);
  });

  it('NUT-9 divides an SR Legacy `modifier` portion by its amount ("cloves", 3, 9 g → 3 g; §16 U11 169230)', () => {
    const portions = [
      srLegacy('cup', 1, 136, 1),
      srLegacy('tsp', 1, 2.8, 2),
      srLegacy('cloves', 3, 9, 3),
    ];
    expect(pickPieceGrams(portions, 'Garlic', 'cloves')).toBe(3);
  });

  it('NUT-9 uses gramWeight as is when amount is absent or not positive', () => {
    expect(pickPieceGrams([srLegacy('clove', null, 4)], 'Garlic', 'clove')).toBe(
      4,
    );
    expect(pickPieceGrams([srLegacy('clove', 0, 4)], 'Garlic', 'clove')).toBe(4);
    expect(pickPieceGrams([srLegacy('clove', -2, 4)], 'Garlic', 'clove')).toBe(
      4,
    );
  });

  it('NUT-9 finds "1 plum tomato" (60 g) over "1 whole" (125 g) from a non-head name word (§16 U11 2709719)', () => {
    const portions = [
      fndds('1 cup, chopped', 180, 1),
      fndds('1 whole', 125, 2),
      fndds('1 plum tomato', 60, 3),
    ];
    expect(pickPieceGrams(portions, 'Plum Tomatoes', undefined)).toBe(60);
  });

  it('NUT-9 drops "cup cherry tomatoes" and finds "cherry" (17 g) for "Cherry Tomatoes"', () => {
    const portions = [
      fndds('1 cup cherry tomatoes', 149, 1),
      fndds('1 cherry', 17, 2),
    ];
    expect(pickPieceGrams(portions, 'Cherry Tomatoes', undefined)).toBe(17);
  });

  it('NUT-9 prefers `medium` or `regular` next ("1 regular carrot" 60 g over "1 baby carrot" 10 g)', () => {
    const portions = [
      fndds('1 baby carrot', 10, 1),
      fndds('1 regular carrot', 60, 2),
      fndds('1 large carrot', 72, 3),
    ];
    expect(pickPieceGrams(portions, 'Carrots', undefined)).toBe(60);
  });

  it('NUT-9 takes `medium` like `regular`', () => {
    const portions = [fndds('1 small', 70, 1), fndds('1 medium', 110, 2)];
    expect(pickPieceGrams(portions, 'Onions', undefined)).toBe(110);
  });

  it('NUT-9 prefers `whole` after `medium`/`regular`', () => {
    const portions = [
      fndds('1 large', 200, 1),
      fndds('1 whole', 125, 2),
    ];
    expect(pickPieceGrams(portions, 'Tomatoes', undefined)).toBe(125);
  });

  it('NUT-9 prefers `large` after `whole`', () => {
    const portions = [fndds('1 small', 38, 1), fndds('1 large', 50, 2)];
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(50);
  });

  it('NUT-9 falls back to the first remaining portion', () => {
    const portions = [fndds('1 small', 38, 1), fndds('1 jumbo', 63, 2)];
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(38);
  });

  it('NUT-9 lets the note or name rule win over `medium`/`regular`', () => {
    const portions = [fndds('1 medium', 110, 1), fndds('1 slice', 14, 2), fndds('1 ring', 12, 3)];
    expect(pickPieceGrams(portions, 'Onions', 'rings')).toBe(12);
  });

  it('NUT-9 drops "Quantity not specified"', () => {
    const portions = [
      fndds('Quantity not specified', 100, 1),
      fndds('1 small', 38, 2),
    ];
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(38);
  });

  it.each([
    '1 cup',
    '1 tbsp',
    '1 tablespoon',
    '1 tsp',
    '1 teaspoon',
    '1 oz',
    '1 ounce',
    '1 lb',
    '1 pound',
    '1 fl oz',
    '1 pint',
    '1 quart',
    '100 ml',
    '100 g',
    '1 slice',
    '1 wedge',
    '1 serving',
    '2 cups',
    '2 slices',
    '1 gram',
    '100 grams',
    '1 kg',
    'RACC',
  ])('NUT-9 never takes "%s" as a piece', (text) => {
    expect(pickPieceGrams([fndds(text, 99, 1)], 'Carrots', undefined)).toBe(
      null,
    );
  });

  it('NUT-9 drops a portion with no text and takes the next one', () => {
    const portions = [fndds('', 100, 1), fndds('1 small', 38, 2)];
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(38);
    expect(pickPieceGrams([fndds('', 100, 1)], 'Eggs', undefined)).toBe(null);
  });

  it('NUT-9 drops a portion whose text has no letters ("1")', () => {
    // Texts are compared as NUT-8 words; a text of digits has none.
    expect(pickPieceGrams([fndds('1', 100, 1)], 'Eggs', undefined)).toBe(null);
  });

  it('NUT-9 offers no piece for Foundation "Garlic, raw", whose only portion is the 85 g RACC (§16 U11 1104647)', () => {
    expect(
      pickPieceGrams([srLegacy('RACC', 1, 85, 1)], 'Garlic', '4 cloves'),
    ).toBe(null);
  });

  it('NUT-9 divides a Foundation unit-only portion by its amount ("tomatoes", 5, 49.7 g → 9.94 g; §16 U15 321360)', () => {
    expect(
      pickPieceGrams(
        [srLegacy('tomatoes', 5, 49.7, 1)],
        'Grape tomatoes',
        undefined,
      ),
    ).toBeCloseTo(9.94, 10);
  });

  it('NUT-9 takes the Foundation egg portion "whole without shell egg" (50.3 g; §16 U11 748967)', () => {
    expect(
      pickPieceGrams(
        [srLegacy('whole without shell egg', 1, 50.3, 1)],
        'Eggs',
        undefined,
      ),
    ).toBe(50.3);
  });

  it('NUT-9 reads `g` as a word, not a letter ("1 large egg" stays)', () => {
    expect(
      pickPieceGrams([fndds('1 large egg', 50, 1)], 'Eggs', undefined),
    ).toBe(50);
  });

  it('NUT-9 walks the portions in `sequenceNumber` order, not array order', () => {
    const portions = [
      fndds('1 jumbo', 63, 3),
      fndds('1 small', 38, 1),
      fndds('1 extra large', 56, 2),
    ];
    // No rule 1-3 match; `large` finds "1 extra large" first by sequence.
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(56);
    // With no size word, the first remaining portion by sequence is "1 small".
    expect(
      pickPieceGrams(
        [fndds('1 jumbo', 63, 3), fndds('1 small', 38, 1)],
        'Eggs',
        undefined,
      ),
    ).toBe(38);
  });

  it('UNSPECIFIED puts portions without a `sequenceNumber` after those with one, in array order', () => {
    const portions = [
      fndds('1 first unnumbered', 11, null),
      fndds('1 second unnumbered', 22, null),
      fndds('1 numbered', 33, 5),
    ];
    expect(pickPieceGrams(portions, 'Eggs', undefined)).toBe(33);
    expect(pickPieceGrams(portions.slice(0, 2), 'Eggs', undefined)).toBe(11);
  });

  it('NUT-5 returns null when no portion is left or there are none', () => {
    expect(
      pickPieceGrams(
        [fndds('1 cup', 240, 1), fndds('Quantity not specified', 100, 2)],
        'Carrots',
        undefined,
      ),
    ).toBe(null);
    expect(pickPieceGrams([], 'Carrots', undefined)).toBe(null);
  });
});

describe('pickPieceGrams with container words (NUT-8, NUT-9)', () => {
  it('NUT-8 "Garlic cloves" finds the "1 clove" portion by rule (1): the container word is a name word, not the head', () => {
    const portions = [fndds('1 whole bulb', 40, 1), fndds('1 clove', 3, 2)];
    expect(pickPieceGrams(portions, 'Garlic cloves', undefined)).toBe(3);
  });

  it('NUT-8 "Celery stalks" finds "1 stalk" over "1 medium" by rule (1)', () => {
    const portions = [fndds('1 medium', 60, 1), fndds('1 stalk', 40, 2)];
    expect(pickPieceGrams(portions, 'Celery stalks', undefined)).toBe(40);
  });
});

describe('isHouseholdMeasure (NUT-6)', () => {
  it.each(['cup', 'tbsp', 'tsp'] as const)(
    'NUT-6 counts `%s` as a household measure',
    (unit) => {
      expect(isHouseholdMeasure(unit)).toBe(true);
    },
  );

  it.each(['g', 'kg', 'ml', 'l', 'pinch', 'piece', 'none'] as const)(
    'NUT-6 does not count `%s` as a household measure',
    (unit) => {
      expect(isHouseholdMeasure(unit)).toBe(false);
    },
  );
});

describe('pickMeasureGrams (NUT-6)', () => {
  it('NUT-6 takes the FNDDS "1 cup" portion for `cup` (3 cups of dry rice weigh what USDA says a cup weighs)', () => {
    const portions = [
      fndds('1 tbsp', 12, 1),
      fndds('1 cup', 185, 2),
      fndds('Quantity not specified', 100, 3),
    ];
    expect(pickMeasureGrams(portions, 'cup')).toBe(185);
  });

  it('NUT-6 divides by a leading fraction ("1/2 cup", 100 g → 200 g per cup)', () => {
    expect(pickMeasureGrams([fndds('1/2 cup', 100, 1)], 'cup')).toBe(200);
  });

  it('NUT-6 divides by a leading mixed number ("1 1/2 cups", 300 g → 200 g per cup)', () => {
    expect(pickMeasureGrams([fndds('1 1/2 cups', 300, 1)], 'cup')).toBe(200);
  });

  it('NUT-6 divides by a leading unicode fraction ("½ cup", 120 g → 240 g per cup)', () => {
    expect(pickMeasureGrams([fndds('½ cup', 120, 1)], 'cup')).toBe(240);
  });

  it('NUT-6 divides by a leading count ("2 tablespoons", 30 g → 15 g per tbsp)', () => {
    expect(pickMeasureGrams([fndds('2 tablespoons', 30, 1)], 'tbsp')).toBe(15);
  });

  it('NUT-6 takes `gramWeight` as is when the FNDDS text starts with no number ("cup, packed")', () => {
    expect(pickMeasureGrams([fndds('cup, packed', 220, 1)], 'cup')).toBe(220);
  });

  it('NUT-6 reads an SR Legacy `modifier` portion with the NUT-9 weight per unit (gramWeight ÷ amount)', () => {
    expect(pickMeasureGrams([srLegacy('cup, chopped', 1, 160, 1)], 'cup')).toBe(
      160,
    );
    expect(pickMeasureGrams([srLegacy('cup, chopped', 2, 320, 1)], 'cup')).toBe(
      160,
    );
  });

  it('NUT-6 a modifier text keeps its `amount`, so a number inside the text is not a divisor', () => {
    // The client keeps `amount` only when there is no portionDescription (NUT-9, §16 U15); this text is not one.
    expect(pickMeasureGrams([srLegacy('2 cups', 1, 300, 1)], 'cup')).toBe(300);
  });

  it('NUT-6 divides a Foundation unit-only "cup" portion by its amount (0.2 cup = 64.6 g → 323 g per cup; §16 U15 746766)', () => {
    expect(
      pickMeasureGrams([srLegacy('cup', 0.2, 64.6, 1)], 'cup'),
    ).toBeCloseTo(323, 10);
  });

  it('NUT-6 takes the first Foundation cup portion in `sequenceNumber` order (0.2 cup before 0.5 cup = 129 g; §16 U15 746766)', () => {
    const portions = [
      srLegacy('cup', 0.5, 129, 2),
      srLegacy('cup', 0.2, 64.6, 1),
    ];
    expect(pickMeasureGrams(portions, 'cup')).toBeCloseTo(323, 10);
    expect(pickMeasureGrams([portions[0]], 'cup')).toBe(258);
  });

  it('NUT-6 divides a Foundation unit-only "tablespoon" portion by its amount (2 tablespoon = 33.9 g → 16.95 g per tbsp; §16 U15 321358)', () => {
    expect(
      pickMeasureGrams([srLegacy('tablespoon', 2, 33.9, 1)], 'tbsp'),
    ).toBeCloseTo(16.95, 10);
  });

  it('NUT-6 matches `tbsp` by "tbsp" or "tablespoon"', () => {
    expect(pickMeasureGrams([fndds('1 Tbsp', 14, 1)], 'tbsp')).toBe(14);
    expect(pickMeasureGrams([fndds('1 tablespoon', 13, 1)], 'tbsp')).toBe(13);
  });

  it('NUT-6 matches `tsp` by "tsp" or "teaspoon"', () => {
    expect(pickMeasureGrams([fndds('1 tsp', 4.2, 1)], 'tsp')).toBe(4.2);
    expect(pickMeasureGrams([fndds('1 teaspoon', 4, 1)], 'tsp')).toBe(4);
  });

  it('NUT-6 never takes one measure for another', () => {
    const portions = [
      fndds('1 cup', 185, 1),
      fndds('1 tablespoon', 12, 2),
      fndds('1 teaspoon', 4, 3),
    ];
    expect(pickMeasureGrams([portions[1], portions[2]], 'cup')).toBeNull();
    expect(pickMeasureGrams([portions[0], portions[2]], 'tbsp')).toBeNull();
    expect(pickMeasureGrams([portions[0], portions[1]], 'tsp')).toBeNull();
    expect(pickMeasureGrams(portions, 'tbsp')).toBe(12);
    expect(pickMeasureGrams(portions, 'tsp')).toBe(4);
  });

  it('NUT-6 reads the text as NUT-9 words ("cupcake" is not a cup)', () => {
    expect(pickMeasureGrams([fndds('1 cupcake', 60, 1)], 'cup')).toBeNull();
  });

  it('NUT-6 takes the first matching portion in `sequenceNumber` order, not array order', () => {
    const portions = [
      fndds('1 cup, sliced', 110, 3),
      fndds('1 cup, chopped', 150, 2),
    ];
    expect(pickMeasureGrams(portions, 'cup')).toBe(150);
  });

  it('NUT-6 returns null when no portion names the measure, and for no portions', () => {
    expect(
      pickMeasureGrams(
        [fndds('1 medium', 110, 1), fndds('Quantity not specified', 100, 2)],
        'cup',
      ),
    ).toBeNull();
    expect(pickMeasureGrams([], 'cup')).toBeNull();
  });
});

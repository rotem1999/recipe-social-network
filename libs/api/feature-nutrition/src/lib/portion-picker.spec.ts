// SPEC §9 NUT-9 (§16 U11, U14): the weight of one piece of a food, from its
// USDA portions. Pure function, no I/O; portions use the client's §9 shape.
import type { UsdaFoodPortion } from '@rsn/api/data-access-usda';

import { pickPieceGrams } from './portion-picker';

/** FNDDS: the text is `portionDescription`, `amount` undefined (client gives null). */
function fndds(
  description: string,
  gramWeight: number,
  sequenceNumber: number | null = null,
): UsdaFoodPortion {
  return { description, gramWeight, amount: null, sequenceNumber };
}

/** SR Legacy / Foundation: the text is `modifier`, the count is `amount`. */
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
      pickPieceGrams([srLegacy('RACC', null, 85, 1)], 'Garlic', '4 cloves'),
    ).toBe(null);
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

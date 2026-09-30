// SPEC.md §3.1.1 and UI-37: how an ingredient quantity and its unit read on
// screen. Pure functions, no I/O. "1 serving" / "N servings" belongs to the
// panels that render servings, not to this module.
import { describe, expect, it } from 'vitest';

import {
  FRACTION_UNITS,
  asFraction,
  formatNumber,
  formatQuantity,
  ingredientAmount,
  pluralUnit,
} from './format-quantity';
import { UNITS } from './util-domain';

describe('formatNumber', () => {
  it('UI-37 keeps whole numbers without decimals', () => {
    expect(formatNumber(2)).toBe('2');
    expect(formatNumber(1)).toBe('1');
  });

  it('UI-37 rounds to two decimals and drops trailing zeros', () => {
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(0.125)).toBe('0.13');
    expect(formatNumber(2.004)).toBe('2');
  });
});

describe('asFraction', () => {
  it('UI-37 shows ¼ ⅓ ½ ⅔ ¾ for quantities below one', () => {
    expect(asFraction(0.25)).toBe('¼');
    expect(asFraction(1 / 3)).toBe('⅓');
    expect(asFraction(0.5)).toBe('½');
    expect(asFraction(2 / 3)).toBe('⅔');
    expect(asFraction(0.75)).toBe('¾');
  });

  it('UI-37 puts the whole-number part in front of the fraction', () => {
    expect(asFraction(1.5)).toBe('1½');
    expect(asFraction(2.25)).toBe('2¼');
    expect(asFraction(1.75)).toBe('1¾');
  });

  it('UI-37 snaps a quantity within 0.02 of a fraction', () => {
    expect(asFraction(0.33)).toBe('⅓');
    expect(asFraction(0.67)).toBe('⅔');
    expect(asFraction(0.26)).toBe('¼');
    expect(asFraction(0.24)).toBe('¼');
    expect(asFraction(0.51)).toBe('½');
    expect(asFraction(1.49)).toBe('1½');
  });

  it('UI-37 snaps a quantity exactly 0.02 from a fraction despite floating-point error', () => {
    expect(asFraction(0.27)).toBe('¼');
    expect(asFraction(0.52)).toBe('½');
    expect(asFraction(0.73)).toBe('¾');
    expect(asFraction(1.27)).toBe('1¼');
  });

  it('UI-37 returns null just outside the 0.02 tolerance', () => {
    expect(asFraction(0.271)).toBeNull();
  });

  it('UI-37 returns null for quantities further than 0.02 from every fraction', () => {
    expect(asFraction(0.4)).toBeNull();
    expect(asFraction(0.3)).toBeNull();
    expect(asFraction(0.55)).toBeNull();
    expect(asFraction(0.1)).toBeNull();
  });

  it('UI-37 returns null for whole numbers', () => {
    expect(asFraction(1)).toBeNull();
    expect(asFraction(3)).toBeNull();
  });
});

describe('pluralUnit', () => {
  it('UI-37 pluralises piece and cup', () => {
    expect(pluralUnit('piece')).toBe('pieces');
    expect(pluralUnit('cup')).toBe('cups');
  });

  it('UI-37 leaves every other unit unchanged', () => {
    for (const unit of UNITS.filter((u) => u !== 'piece' && u !== 'cup')) {
      expect(pluralUnit(unit)).toBe(unit);
    }
  });
});

describe('FRACTION_UNITS', () => {
  it('UI-37 is exactly cup, tbsp and tsp', () => {
    expect([...FRACTION_UNITS].sort()).toEqual(['cup', 'tbsp', 'tsp']);
  });
});

describe('formatQuantity', () => {
  it('UI-37 pluralises piece and cup after a quantity above 1', () => {
    expect(formatQuantity(2, 'piece')).toBe('2 pieces');
    expect(formatQuantity(3, 'cup')).toBe('3 cups');
  });

  it('UI-37 keeps the singular after exactly 1', () => {
    expect(formatQuantity(1, 'piece')).toBe('1 piece');
    expect(formatQuantity(1, 'cup')).toBe('1 cup');
  });

  it('UI-37 keeps the singular after a fraction below 1', () => {
    expect(formatQuantity(0.75, 'cup')).toBe('¾ cup');
    expect(formatQuantity(0.5, 'cup')).toBe('½ cup');
    expect(formatQuantity(1 / 3, 'cup')).toBe('⅓ cup');
  });

  it('UI-37 pluralises a fraction with a whole-number part ("1½ cups")', () => {
    expect(formatQuantity(1.5, 'cup')).toBe('1½ cups');
    expect(formatQuantity(2.25, 'cup')).toBe('2¼ cups');
  });

  it('UI-37 pluralises a decimal below 1 that is not a common fraction ("0.4 cups")', () => {
    expect(formatQuantity(0.4, 'cup')).toBe('0.4 cups');
  });

  it('UI-37 shows fractions in tbsp and tsp, which never take a plural', () => {
    expect(formatQuantity(1.5, 'tbsp')).toBe('1½ tbsp');
    expect(formatQuantity(0.25, 'tsp')).toBe('¼ tsp');
    expect(formatQuantity(2, 'tbsp')).toBe('2 tbsp');
    expect(formatQuantity(3, 'tsp')).toBe('3 tsp');
  });

  it('UI-37 snaps cup, tbsp and tsp quantities within 0.02 of a fraction', () => {
    expect(formatQuantity(0.33, 'cup')).toBe('⅓ cup');
    expect(formatQuantity(0.67, 'tbsp')).toBe('⅔ tbsp');
    expect(formatQuantity(1.49, 'tsp')).toBe('1½ tsp');
  });

  it('UI-37 shows decimals, not fractions, for units other than cup, tbsp and tsp', () => {
    expect(formatQuantity(0.5, 'kg')).toBe('0.5 kg');
    expect(formatQuantity(1.5, 'l')).toBe('1.5 l');
    expect(formatQuantity(2.5, 'piece')).toBe('2.5 pieces');
  });

  it('UI-37 reads half a piece as "0.5 pieces"', () => {
    expect(formatQuantity(0.5, 'piece')).toBe('0.5 pieces');
  });

  it('UI-37 snaps cup quantities exactly 0.02 from a fraction', () => {
    expect(formatQuantity(0.52, 'cup')).toBe('½ cup');
    expect(formatQuantity(1.27, 'cup')).toBe('1¼ cups');
  });

  it('UI-37 does not pluralise g, kg, ml, l or pinch', () => {
    expect(formatQuantity(200, 'g')).toBe('200 g');
    expect(formatQuantity(2, 'kg')).toBe('2 kg');
    expect(formatQuantity(250, 'ml')).toBe('250 ml');
    expect(formatQuantity(2, 'l')).toBe('2 l');
    expect(formatQuantity(2, 'pinch')).toBe('2 pinch');
  });

  it('§3.1.1 shows a unit-less count for the unit none', () => {
    expect(formatQuantity(2, 'none')).toBe('2');
    expect(formatQuantity(0.5, 'none')).toBe('0.5');
  });

  it('§3.1.1 reads an empty quantity with the unit none as "to taste"', () => {
    expect(formatQuantity(null, 'none')).toBe('to taste');
  });

  it('UI-37 shows only the unit when the quantity is empty and a unit is set', () => {
    expect(formatQuantity(null, 'pinch')).toBe('pinch');
    expect(formatQuantity(null, 'cup')).toBe('cup');
  });

  it('UI-37 rounds a quantity that rounds to 1 into the singular', () => {
    expect(formatQuantity(1.001, 'piece')).toBe('1 piece');
  });
});

describe('ingredientAmount', () => {
  it('UI-37 BUG-030 moves a note that starts with a digit into the amount column', () => {
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: '1 Can' }),
    ).toEqual({ amount: '1 Can', note: null });
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: '4 oz' }),
    ).toEqual({ amount: '4 oz', note: null });
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: '1/2 tin' }),
    ).toEqual({ amount: '1/2 tin', note: null });
  });

  it('UI-37 BUG-030 moves a note that starts with a fraction character', () => {
    for (const note of ['¼ lb', '⅓ bottle', '½ jar', '⅔ packet', '¾ pint', '⅛ inch']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 BUG-030 moves a note whose first word is a CAT-6 measurement word, in any letter case', () => {
    for (const note of [
      'Dash',
      'dash of Tabasco',
      'Pinch',
      'Handful',
      'Sprig',
      'Bunch',
      'Can',
      'LB',
      'Litre',
      'liter',
    ]) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 BUG-030 recognises the plurals of the CAT-6 measurement words', () => {
    for (const note of [
      'Cans',
      'ounces',
      'pounds',
      'Slices',
      'sprigs',
      'bunches',
      'pinches',
      'inches',
      'handfuls',
      'drops',
      'sticks',
      'packets',
      'packages',
      'bottles',
      'jars',
      'tins',
      'dashes',
      'quarts',
      'gallons',
      'pints',
    ]) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 BUG-030 moves "Cans", "inches", "pinches" and "lbs" as regular plurals', () => {
    for (const note of ['Cans', '2 Cans', 'inches', 'pinches', 'lbs', 'LBS of flour']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 keeps words that are not regular plurals of a measurement word as notes ("canes", "tines", "ozes", "lbss")', () => {
    for (const note of ['canes', 'tines', 'ozes', 'lbss', 'jares', 'sprigses']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: 'to taste',
        note,
      });
    }
  });

  it('UI-37 recognises only the listed fraction characters ¼ ⅓ ½ ⅔ ¾ ⅛', () => {
    for (const note of ['⅕ wheel', '⅙ block', '⅜ loaf']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: 'to taste',
        note,
      });
    }
  });

  it('UI-37 BUG-030 reads a measurement word with trailing punctuation as a measurement', () => {
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: 'Dash, to finish' }),
    ).toEqual({ amount: 'Dash, to finish', note: null });
  });

  it('UI-37 trims the note it moves into the amount column', () => {
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: '  1 Can  ' }),
    ).toEqual({ amount: '1 Can', note: null });
  });

  it('UI-37 moves a note with a digit anywhere into the amount column ("Juice of 1/2", "Zest and juice of 1")', () => {
    for (const note of ['Juice of 1/2', 'Zest and juice of 1', 'Juice of 1', 'About 200 g']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 moves a note with a listed fraction character anywhere into the amount column', () => {
    for (const note of ['Juice of ½', 'Zest of ¼', 'about ⅓', 'roughly ⅔', 'near ¾', 'a scant ⅛']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: note,
        note: null,
      });
    }
  });

  it('UI-37 keeps "to taste" for a note with no digit, fraction or leading measurement word ("to serve", "For Greasing")', () => {
    for (const note of ['to serve', 'For Greasing', 'Juice of a lemon', 'garnish with sprigs']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: 'to taste',
        note,
      });
    }
  });

  it('UI-37 keeps an amount-like note with a digit as the note when a quantity is set', () => {
    expect(
      ingredientAmount({ quantity: 1, unit: 'piece', note: 'Juice of 1/2' }),
    ).toEqual({ amount: '1 piece', note: 'Juice of 1/2' });
  });

  it('UI-37 keeps "to taste" and the note when the note is not an amount', () => {
    for (const note of ['chopped', 'large', 'canned', 'Fresh sprigs']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: 'to taste',
        note,
      });
    }
  });

  it('UI-37 keeps a right-to-left note that is not an amount as the note', () => {
    expect(
      ingredientAmount({ quantity: null, unit: 'none', note: 'קצוץ דק' }),
    ).toEqual({ amount: 'to taste', note: 'קצוץ דק' });
  });

  it('UI-37 reads "to taste" with no note when the note is missing, null, empty or blank', () => {
    for (const note of [undefined, null, '', '   ']) {
      expect(ingredientAmount({ quantity: null, unit: 'none', note })).toEqual({
        amount: 'to taste',
        note: null,
      });
    }
    expect(ingredientAmount({ quantity: null, unit: 'none' })).toEqual({
      amount: 'to taste',
      note: null,
    });
  });

  it('UI-37 formats a set quantity and keeps an amount-like note as the note', () => {
    expect(
      ingredientAmount({ quantity: 2, unit: 'none', note: '1 Can' }),
    ).toEqual({ amount: '2', note: '1 Can' });
    expect(
      ingredientAmount({ quantity: 0.75, unit: 'cup', note: 'Dash' }),
    ).toEqual({ amount: '¾ cup', note: 'Dash' });
    expect(
      ingredientAmount({ quantity: 2, unit: 'piece', note: 'large' }),
    ).toEqual({ amount: '2 pieces', note: 'large' });
  });

  it('UI-37 shows the unit alone for an empty quantity with a unit, and keeps the note', () => {
    expect(
      ingredientAmount({ quantity: null, unit: 'pinch', note: '1 pinch' }),
    ).toEqual({ amount: 'pinch', note: '1 pinch' });
    expect(
      ingredientAmount({ quantity: null, unit: 'cup', note: 'heaped' }),
    ).toEqual({ amount: 'cup', note: 'heaped' });
  });

  it('UI-37 returns the trimmed note next to a formatted quantity', () => {
    expect(
      ingredientAmount({ quantity: 200, unit: 'g', note: '  sifted ' }),
    ).toEqual({ amount: '200 g', note: 'sifted' });
  });
});

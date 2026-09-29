// SPEC §9 NUT-10 (§16 U12): a `none`-unit note such as "1 lb" or "4 oz" is a
// weight. Pure function, no I/O.
import { gramsFromWeightNote } from './weight-note';

/** §16 U12: NIST Handbook 44 Appendix C, exact avoirdupois definitions. */
const GRAMS_PER_POUND = 453.59237;
const GRAMS_PER_OUNCE = 28.349523125;

describe('gramsFromWeightNote (NUT-10)', () => {
  it('NUT-10 counts "1 lb" as 453.59237 g', () => {
    expect(gramsFromWeightNote('1 lb')).toBe(453.59237);
  });

  it('NUT-10 counts "4 oz" as 4 × 28.349523125 g', () => {
    expect(gramsFromWeightNote('4 oz')).toBeCloseTo(4 * GRAMS_PER_OUNCE, 9);
  });

  it('NUT-10 reads a mixed fraction ("1 1/2 lb")', () => {
    expect(gramsFromWeightNote('1 1/2 lb')).toBeCloseTo(
      1.5 * GRAMS_PER_POUND,
      9,
    );
  });

  it('NUT-10 reads a unicode fraction ("½ lb") and a mixed unicode fraction ("1½ lb")', () => {
    expect(gramsFromWeightNote('½ lb')).toBeCloseTo(0.5 * GRAMS_PER_POUND, 9);
    expect(gramsFromWeightNote('1½ lb')).toBeCloseTo(1.5 * GRAMS_PER_POUND, 9);
    expect(gramsFromWeightNote('¼ lb')).toBeCloseTo(0.25 * GRAMS_PER_POUND, 9);
    expect(gramsFromWeightNote('¾ lb')).toBeCloseTo(0.75 * GRAMS_PER_POUND, 9);
  });

  it('NUT-10 reads a plain fraction ("1/2 lb")', () => {
    expect(gramsFromWeightNote('1/2 lb')).toBeCloseTo(0.5 * GRAMS_PER_POUND, 9);
  });

  it('NUT-10 accepts the unit with or without a space ("4oz", "2lb")', () => {
    expect(gramsFromWeightNote('4oz')).toBeCloseTo(4 * GRAMS_PER_OUNCE, 9);
    expect(gramsFromWeightNote('2lb')).toBeCloseTo(2 * GRAMS_PER_POUND, 9);
  });

  it.each([
    ['1 lbs', GRAMS_PER_POUND],
    ['1 pound', GRAMS_PER_POUND],
    ['2 pounds', 2 * GRAMS_PER_POUND],
    ['1 ounce', GRAMS_PER_OUNCE],
    ['8 ounces', 8 * GRAMS_PER_OUNCE],
    ['1 LB', GRAMS_PER_POUND],
    ['4 Oz', 4 * GRAMS_PER_OUNCE],
  ])('NUT-10 reads "%s" as a weight', (note, grams) => {
    expect(gramsFromWeightNote(note)).toBeCloseTo(grams, 9);
  });

  it.each([
    '4 cloves',
    '1 pint',
    '2 cups',
    '1 ozark',
    'lb',
    'a pound',
    'to taste',
    '1/0 lb',
    '',
  ])('NUT-10 does not read "%s" as a weight', (note) => {
    expect(gramsFromWeightNote(note)).toBe(null);
  });

  it('NUT-10 returns null for a missing note', () => {
    expect(gramsFromWeightNote(undefined)).toBe(null);
  });

  it('NUT-10 ignores the text after the weight ("1 lb minced" → 453.59237 g)', () => {
    expect(gramsFromWeightNote('1 lb minced')).toBe(453.59237);
    expect(gramsFromWeightNote('8oz, diced')).toBeCloseTo(8 * GRAMS_PER_OUNCE, 9);
  });

  it('NUT-10 trims the note before reading the number', () => {
    expect(gramsFromWeightNote('  2 lb ')).toBeCloseTo(2 * GRAMS_PER_POUND, 9);
  });

  it('NUT-10 reads a decimal number ("1.5 lb")', () => {
    expect(gramsFromWeightNote('1.5 lb')).toBeCloseTo(1.5 * GRAMS_PER_POUND, 9);
  });
});

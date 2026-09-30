// SPEC.md §3.1.1 and UI-37: how an ingredient quantity and its unit read on
// screen. One implementation for the recipe detail's ingredient list and cook
// mode's ingredients panel.
import type { Unit } from './util-domain';

/** Two decimals at most, with the trailing zeros dropped ("1.5", not "1.50"). */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** UI-37: the units whose quantities read as kitchen fractions. */
export const FRACTION_UNITS: ReadonlySet<Unit> = new Set<Unit>([
  'cup',
  'tbsp',
  'tsp',
]);

/** UI-37: the fractions a quantity snaps to, within 0.02. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** UI-37: "¾", "1½" — or null when the quantity is not near one of the fractions. */
export function asFraction(value: number): string | null {
  const whole = Math.floor(value);
  const rest = value - whole;
  for (const [fraction, glyph] of FRACTIONS) {
    // The epsilon keeps values exactly 0.02 away (0.27, 0.52) inside the
    // tolerance despite floating-point error (0.27 - 0.25 is 0.020000000000000018).
    if (Math.abs(rest - fraction) <= 0.02 + 1e-9) {
      return whole === 0 ? glyph : `${whole}${glyph}`;
    }
  }
  return null;
}

/** UI-37: the units that take a plural after a quantity other than 1. */
const PLURALS: Partial<Record<Unit, string>> = {
  piece: 'pieces',
  cup: 'cups',
};

/** UI-37: "pieces" and "cups" in the plural; every other unit reads the same. */
export function pluralUnit(unit: Unit): string {
  return PLURALS[unit] ?? unit;
}

/**
 * §3.1.1: an empty quantity means "to taste"; `none` is a unit-less count.
 * UI-37: "2 pieces", "3 cups", "¾ cup", "1½ tbsp" — a quantity shown as a
 * fraction below one keeps the singular, as in the row's "¾ cup".
 */
export function formatQuantity(quantity: number | null, unit: Unit): string {
  const parts: string[] = [];
  let plural = false;
  if (quantity !== null) {
    const fraction = FRACTION_UNITS.has(unit) ? asFraction(quantity) : null;
    const shown = fraction ?? formatNumber(quantity);
    parts.push(shown);
    plural = shown !== '1' && !(fraction !== null && quantity < 1);
  }
  if (unit !== 'none') {
    parts.push(plural ? pluralUnit(unit) : unit);
  }
  return parts.length === 0 ? 'to taste' : parts.join(' ');
}

/** CAT-6: the measurement words the app cannot express as a unit, singular and plural. */
const MEASURE_WORDS: ReadonlySet<string> = new Set(
  [
    'oz', 'ounce', 'lb', 'pound', 'pint', 'quart', 'gallon', 'litre', 'liter',
    'drop', 'stick', 'can', 'tin', 'jar', 'packet', 'package', 'bottle',
    'handful', 'slice', 'sprig', 'cm', 'mm',
  ]
    .flatMap((word) => [word, `${word}s`])
    // Words ending in a hissing sound take "es" in the plural.
    .concat(['dash', 'dashes', 'bunch', 'bunches', 'inch', 'inches', 'pinch', 'pinches']),
);

/** UI-37: the note is really an amount ("1 Can", "½ jar", "Dash") rather than a note. */
function noteIsAmount(note: string): boolean {
  // A digit or fraction anywhere states an amount ("1 Can", "Juice of 1/2").
  if (/[\d¼⅓½⅔¾⅛]/.test(note)) {
    return true;
  }
  const first = note.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  return MEASURE_WORDS.has(first);
}

/**
 * UI-37, BUG-030: the amount column and the note of one ingredient row. An empty
 * quantity with the unit `none` reads "to taste", unless its note is itself an
 * amount (CAT-6 keeps "1 Can" as a note): then the note fills the amount column
 * and is not repeated as the note.
 */
export function ingredientAmount(ingredient: {
  quantity: number | null;
  unit: Unit;
  note?: string | null;
}): { amount: string; note: string | null } {
  const note = ingredient.note?.trim() ? ingredient.note.trim() : null;
  if (ingredient.quantity === null && ingredient.unit === 'none' && note !== null && noteIsAmount(note)) {
    return { amount: note, note: null };
  }
  return { amount: formatQuantity(ingredient.quantity, ingredient.unit), note };
}

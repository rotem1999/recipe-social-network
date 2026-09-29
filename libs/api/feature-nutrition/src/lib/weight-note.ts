// SPEC.md NUT-10: a `none`-unit note that starts with "1 lb" or "4 oz" is a weight.

import { readLeadingNumber } from '@rsn/shared/util-domain';

/** NUT-10 (§16 U12): exact avoirdupois definitions. */
const GRAMS_PER_OUNCE = 28.349523125;
const GRAMS_PER_POUND = 453.59237;

/**
 * NUT-10: grams for a note that starts with a number (the CAT-6 forms) and an
 * avoirdupois weight word in any letter case; text after it ("minced") is
 * ignored. Null for anything else.
 */
export function gramsFromWeightNote(note: string | undefined): number | null {
  const parsed = readLeadingNumber((note ?? '').trim());
  if (parsed === null) return null;
  const unit = /^\s*(oz|ounces?|lbs?|pounds?)\b/i.exec(parsed.rest);
  if (unit === null) return null;
  const word = unit[1].toLowerCase();
  const perUnit =
    word === 'oz' || word.startsWith('ounce')
      ? GRAMS_PER_OUNCE
      : GRAMS_PER_POUND;
  return parsed.value * perUnit;
}

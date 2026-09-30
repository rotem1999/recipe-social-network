// SPEC.md NUT-9: the weight of one piece of a food, from its USDA portions.
// SPEC.md NUT-6: the weight of one cup, tablespoon or teaspoon of a food, likewise.

import type { UsdaFoodPortion } from '@rsn/api/data-access-usda';
import { readLeadingNumber } from '@rsn/shared/util-domain';
import type { Unit } from '@rsn/shared/util-domain';

import { containsPhrase, headWord, toWords } from './words';

/** NUT-9: portions naming a volume, a weight or a serving are never a piece. */
const NOT_A_PIECE: ReadonlySet<string> = new Set([
  'cup',
  'tbsp',
  'tablespoon',
  'tsp',
  'teaspoon',
  'oz',
  'ounce',
  'lb',
  'pound',
  'fl',
  'pint',
  'quart',
  'ml',
  'g',
  'slice',
  'wedge',
  'serving',
  'gram',
  'kg',
  'racc',
]);

const QUANTITY_NOT_SPECIFIED = ['quantity', 'not', 'specified'];

interface Candidate {
  words: string[];
  gramsPerPiece: number;
}

/** NUT-9: `gramWeight ÷ amount`, with `amount` 1 when absent or not positive. */
function gramsPerPiece(portion: UsdaFoodPortion): number {
  const amount =
    portion.amount !== null && portion.amount > 0 ? portion.amount : 1;
  return portion.gramWeight / amount;
}

/** NUT-9: `sequenceNumber` order; portions without one keep their place after those with one. */
function inSequence(portions: readonly UsdaFoodPortion[]): UsdaFoodPortion[] {
  return portions
    .map((portion, index) => ({ portion, index }))
    .sort((a, b) => {
      const left = a.portion.sequenceNumber ?? Number.POSITIVE_INFINITY;
      const right = b.portion.sequenceNumber ?? Number.POSITIVE_INFINITY;
      return left === right ? a.index - b.index : left - right;
    })
    .map(({ portion }) => portion);
}

/**
 * NUT-9: grams of one piece for an ingredient `name` with an optional `note`,
 * or null when no portion qualifies (NUT-5).
 */
export function pickPieceGrams(
  portions: readonly UsdaFoodPortion[],
  name: string,
  note: string | undefined,
): number | null {
  const candidates: Candidate[] = [];
  for (const portion of inSequence(portions)) {
    const words = toWords(portion.description);
    if (
      words.length === 0 ||
      words.some((word) => NOT_A_PIECE.has(word)) ||
      containsPhrase(words, QUANTITY_NOT_SPECIFIED)
    ) {
      continue;
    }
    candidates.push({ words, gramsPerPiece: gramsPerPiece(portion) });
  }

  const nameWords = toWords(name);
  // NUT-8: a container word is never the head, so "Garlic cloves" keys on `clove`.
  const head = headWord(nameWords);
  const keyWords = new Set(nameWords.filter((word) => word !== head));
  const noteFirstWord = toWords(note ?? '')[0];
  if (noteFirstWord !== undefined) keyWords.add(noteFirstWord);

  const rules: ((candidate: Candidate) => boolean)[] = [
    (candidate) => candidate.words.some((word) => keyWords.has(word)),
    (candidate) =>
      candidate.words.includes('medium') || candidate.words.includes('regular'),
    (candidate) => candidate.words.includes('whole'),
    (candidate) => candidate.words.includes('large'),
    () => true,
  ];
  for (const rule of rules) {
    const found = candidates.find(rule);
    if (found !== undefined) return found.gramsPerPiece;
  }
  return null;
}

/** NUT-6: the household measures a food's own portion may weigh. */
export type HouseholdMeasure = Extract<Unit, 'cup' | 'tbsp' | 'tsp'>;

/** NUT-6: the portion words, after the NUT-8 word rules, that name each measure. */
const MEASURE_WORDS: Readonly<Record<HouseholdMeasure, ReadonlySet<string>>> = {
  cup: new Set(['cup']),
  tbsp: new Set(['tbsp', 'tablespoon']),
  tsp: new Set(['tsp', 'teaspoon']),
};

/** NUT-6: whether `unit` is a measure the chosen food's own portion weighs first. */
export function isHouseholdMeasure(unit: Unit): unit is HouseholdMeasure {
  return unit === 'cup' || unit === 'tbsp' || unit === 'tsp';
}

/**
 * NUT-6: grams of one measure unit of a portion. A `portionDescription` that
 * starts with a number (CAT-6 forms: "2 tablespoons", "1/2 cup", "1 1/2 cups")
 * divides `gramWeight` by it; otherwise the NUT-9 weight per unit applies.
 * The client keeps `amount` whenever `portionDescription` is empty (NUT-9),
 * so a null `amount` marks text that is the `portionDescription`.
 */
function gramsPerMeasure(portion: UsdaFoodPortion): number {
  if (portion.amount === null) {
    const leading = readLeadingNumber(portion.description.trim());
    if (leading !== null && leading.value > 0) {
      return portion.gramWeight / leading.value;
    }
  }
  return gramsPerPiece(portion);
}

/**
 * NUT-6: grams of one `measure` of a food, from the first portion in NUT-9
 * `sequenceNumber` order whose text (NUT-9 word rules) names that measure
 * ("1 cup", "cup, chopped", "2 tablespoons"), per unit of the measure;
 * null when no portion names it, and the caller falls back to water density.
 */
export function pickMeasureGrams(
  portions: readonly UsdaFoodPortion[],
  measure: HouseholdMeasure,
): number | null {
  const words = MEASURE_WORDS[measure];
  for (const portion of inSequence(portions)) {
    if (toWords(portion.description).some((word) => words.has(word))) {
      return gramsPerMeasure(portion);
    }
  }
  return null;
}

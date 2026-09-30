// SPEC.md NUT-9: the weight of one piece of a food, from its USDA portions.

import type { UsdaFoodPortion } from '@rsn/api/data-access-usda';

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

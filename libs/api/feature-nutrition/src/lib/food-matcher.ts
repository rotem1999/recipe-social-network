// SPEC.md NUT-8: which FoodData Central search hit an ingredient name means.
// USDA's own ranking is not trusted ("Garlic" ranks "Garlic sauce" first).

import type { UsdaFoodHit } from '@rsn/api/data-access-usda';

import { headWord, singularise, toWords } from './words';

/**
 * NUT-8: first-segment words that are neither rewarded nor penalised, kept in
 * their singularised form because descriptions are compared that way (`nfs` → `nf`).
 */
const NEUTRAL_WORDS: ReadonlySet<string> = new Set(
  ['raw', 'fresh', 'whole', 'nfs', 'and', 'or', 'with', 'of'].map(singularise),
);

/** NUT-8: a segment made of one of these words is a part of the food, not the food. */
const PART_WORDS: ReadonlySet<string> = new Set([
  'skin',
  'peel',
  'rind',
  'juice',
]);

/** NUT-8: "Potatoes, raw, skin" — a segment that is only a part word the name does not ask for. */
function hasUnwantedPartSegment(
  description: string,
  nameSet: ReadonlySet<string>,
): boolean {
  return description.split(',').some((segment) => {
    const words = toWords(segment);
    return (
      words.length === 1 && PART_WORDS.has(words[0]) && !nameSet.has(words[0])
    );
  });
}

/**
 * NUT-8: the first search's query — every name word required with `+`, and
 * the optional word `raw` so raw ingredients rank higher ("+ground +beef raw").
 */
export function strictQuery(name: string): string {
  const required = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => `+${word}`);
  return [...required, 'raw'].join(' ');
}

/**
 * NUT-8: a hit's score for an ingredient name, or null when the hit is
 * skipped: no energy value, the head word missing from the description, no
 * name word in the first segment ("Snacks, pretzels, … flour"), or a segment
 * that is only a part the name does not ask for ("Potatoes, raw, skin").
 */
export function scoreHit(name: string, hit: UsdaFoodHit): number | null {
  const nameWords = toWords(name);
  if (nameWords.length === 0 || hit.kcalPer100g === null) return null;

  // NUT-8: the last name word that is not a container word ("Garlic cloves" → garlic).
  const head = headWord(nameWords);
  const descriptionWords = toWords(hit.description);
  if (!descriptionWords.includes(head)) return null;

  const nameSet = new Set(nameWords);
  const firstSegment = toWords(hit.description.split(',')[0] ?? '');
  if (!firstSegment.some((word) => nameSet.has(word))) return null;
  if (hasUnwantedPartSegment(hit.description, nameSet)) return null;

  const foreign = firstSegment.filter(
    (word) => !nameSet.has(word) && !NEUTRAL_WORDS.has(word),
  ).length;

  let score = foreign === 0 ? 3 : -3 * foreign;
  for (const word of nameSet) {
    if (word !== head && descriptionWords.includes(word)) score += 2;
  }
  if (descriptionWords.includes('raw')) score += 2;
  return score;
}

/**
 * NUT-8: the highest-scoring hit; a tie goes to the description with fewer
 * words, then to USDA's order; null when all are skipped.
 */
export function chooseFood(
  name: string,
  hits: readonly UsdaFoodHit[],
): UsdaFoodHit | null {
  let best: UsdaFoodHit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const hit of hits) {
    const score = scoreHit(name, hit);
    if (score === null) continue;
    const length = toWords(hit.description).length;
    if (score > bestScore || (score === bestScore && length < bestLength)) {
      best = hit;
      bestScore = score;
      bestLength = length;
    }
  }
  return best;
}

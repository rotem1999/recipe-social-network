// SPEC.md NUT-8, NUT-9: the word rules shared by food choice and portion choice.

/**
 * NUT-8: a word longer than 3 letters ending in `es` after `o`, `x`, `ch`,
 * `sh` or `ss` drops the `es` ("tomatoes" → "tomato", "glasses" → "glass");
 * otherwise a word longer than 2 letters ending in `s` not preceded by `s`
 * drops the `s` ("cloves" → "clove", "cheeses" → "cheese"; "glass" stays).
 */
export function singularise(word: string): string {
  if (word.length > 3 && /(?:o|x|ch|sh|ss)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/** NUT-8: lower-cased, split on anything that is not a letter (accented letters count), singularised. */
export function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0)
    .map(singularise);
}

/**
 * NUT-8: words that name a piece of a food, never the food itself (compared after
 * singularising). They stay name words for the query, the scores and NUT-9 rule (1).
 */
const CONTAINER_WORDS: ReadonlySet<string> = new Set(
  ['clove', 'breast', 'fillet', 'filet', 'stalk', 'sprig', 'slice', 'leaf', 'leave', 'head'].map(
    singularise,
  ),
);

/**
 * NUT-8: the head word is the last name word that is not a container word
 * ("Garlic cloves" → `garlic`, "Chicken breasts" → `chicken`); a name made only
 * of container words keeps its last word. Only the nutrition lookup uses it.
 */
export function headWord(nameWords: readonly string[]): string {
  for (let index = nameWords.length - 1; index >= 0; index -= 1) {
    if (!CONTAINER_WORDS.has(nameWords[index])) return nameWords[index];
  }
  return nameWords[nameWords.length - 1];
}

/** NUT-9: whether `words` holds `phrase` as consecutive words. */
export function containsPhrase(
  words: readonly string[],
  phrase: readonly string[],
): boolean {
  if (phrase.length === 0) return false;
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, offset) => words[start + offset] === word)) {
      return true;
    }
  }
  return false;
}

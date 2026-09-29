// SPEC.md NUT-7: seasonings count as 0 kcal without a USDA lookup.

/** NUT-7: the `matchedDescription` a seasoning row carries. */
export const SEASONING_DESCRIPTION = 'Seasoning, counted as 0 kcal';

/** NUT-7: leading words removed before the name is compared with the list. */
const LEADING_QUALIFIERS: ReadonlySet<string> = new Set([
  'freshly',
  'fresh',
  'ground',
  'dried',
  'crushed',
  'cracked',
  'whole',
  'smoked',
  'fine',
  'coarse',
  'flaky',
  'kosher',
  'sea',
  'table',
  'rock',
  'black',
  'white',
]);

/** NUT-7: the seasoning list, in its normalised form. */
const SEASONINGS: ReadonlySet<string> = new Set([
  'salt',
  'pepper',
  'salt and pepper',
  'peppercorns',
  'cayenne',
  'cayenne pepper',
  'paprika',
  'cumin',
  'cumin seeds',
  'coriander',
  'coriander seeds',
  'turmeric',
  'cinnamon',
  'cinnamon stick',
  'cinnamon sticks',
  'nutmeg',
  'allspice',
  'cloves',
  'cardamom',
  'cardamom pods',
  'star anise',
  'fennel seeds',
  'mustard seeds',
  'caraway seeds',
  'saffron',
  'sumac',
  "za'atar",
  'zaatar',
  'oregano',
  'thyme',
  'rosemary',
  'sage',
  'bay leaf',
  'bay leaves',
  'marjoram',
  'tarragon',
  'dill',
  'herbes de provence',
  'mixed herbs',
  'italian seasoning',
  'chilli powder',
  'chili powder',
  'chile powder',
  'chilli flakes',
  'chili flakes',
  'red pepper flakes',
  'red chilli flakes',
  'garlic powder',
  'onion powder',
  'ginger',
  'curry powder',
  'garam masala',
  'five spice',
  'chinese five spice',
  'cajun seasoning',
  'seasoning',
  'msg',
]);

/**
 * NUT-7: lower-cased, `&` read as `and`, `’` read as `'`, anything that is
 * neither a letter nor an apostrophe replaced by a space, spaces collapsed,
 * leading qualifiers ("freshly ground black") dropped but never the last word.
 */
export function normaliseSeasoningName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/’/g, "'")
    .replace(/[^\p{L}' ]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0);
  let start = 0;
  while (start < words.length - 1 && LEADING_QUALIFIERS.has(words[start])) {
    start += 1;
  }
  return words.slice(start).join(' ');
}

/** NUT-7: whether an ingredient name is on the seasoning list. */
export function isSeasoning(name: string): boolean {
  return SEASONINGS.has(normaliseSeasoningName(name));
}

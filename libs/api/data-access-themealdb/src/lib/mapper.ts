// CAT-6 (§3.3): pure mappers from TheMealDB's raw meal object onto the shared domain
// types. No Nest, no I/O — the service and TheMealDbMapper provider call these.

import {
  Category,
  DEFAULT_CATALOGUE_SERVINGS,
  Ingredient,
  RecipeContent,
  Step,
  Unit,
  isCategory,
} from '@rsn/shared/util-domain';
import {
  CatalogueItemDto,
  CataloguePreviewDto,
} from '@rsn/shared/util-contracts';
import { MEAL_SLOT_COUNT, MealFilterRow, MealRecord } from './meal-record';

/**
 * §3.3 (§16 M5): the exact attribution string TheMealDB's paid tier requires.
 * This library is the only place it is defined.
 */
export const THEMEALDB_ATTRIBUTION =
  'Recipe data and imagery: TheMealDB (https://www.themealdb.com/)';

/** CAT-5: `strCategory` is one of the 14 categories; anything else falls back here. */
const FALLBACK_CATEGORY: Category = 'Miscellaneous';

/** CAT-6: a paragraph longer than this is split on sentence ends. */
const MAX_STEP_LENGTH = 300;

/** CAT-6: the fixed unit list a measure may use. Everything else keeps the raw text. */
const UNIT_WORDS: Readonly<Record<string, Unit>> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  pinch: 'pinch',
};

/**
 * CAT-6: measurement words outside the fixed list. A number followed by one of these
 * ("4 oz", "1 lb") is a quantity the app cannot express, so the raw measure stays in the
 * note; any other trailing text ("2 large") is a piece count with a description.
 */
const FOREIGN_UNIT_WORDS: ReadonlySet<string> = new Set([
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'pint',
  'pints',
  'pt',
  'quart',
  'quarts',
  'qt',
  'gallon',
  'gallons',
  'gal',
  'litre',
  'litres',
  'liter',
  'liters',
  'dash',
  'dashes',
  'drop',
  'drops',
  'stick',
  'sticks',
  'can',
  'cans',
  'tin',
  'tins',
  'jar',
  'jars',
  'packet',
  'packets',
  'package',
  'packages',
  'bottle',
  'bottles',
  'bunch',
  'bunches',
  'handful',
  'handfuls',
  'slice',
  'slices',
  'sprig',
  'sprigs',
  'inch',
  'inches',
  'cm',
  'mm',
]);

/** CAT-6: the unicode fractions TheMealDB measures use. */
const UNICODE_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
};

/** CAT-6: "1." / "1)" / "STEP 1" / "Step 1:" prefixes are dropped from a step. */
const STEP_NUMBER_PREFIX = /^(?:step\s*\d+\s*[.):\-–]?\s*|\d+\s*[.):\-–]\s*)/i;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ParsedNumber {
  value: number;
  rest: string;
}

/** CAT-6: reads a leading integer, decimal, fraction, mixed number or unicode fraction. */
function readNumber(text: string): ParsedNumber | null {
  const mixedAscii = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(text);
  if (mixedAscii && Number(mixedAscii[3]) !== 0) {
    return {
      value:
        Number(mixedAscii[1]) + Number(mixedAscii[2]) / Number(mixedAscii[3]),
      rest: text.slice(mixedAscii[0].length),
    };
  }

  const mixedUnicode = /^(\d+)\s*([½¼¾])/.exec(text);
  if (mixedUnicode) {
    return {
      value: Number(mixedUnicode[1]) + UNICODE_FRACTIONS[mixedUnicode[2]],
      rest: text.slice(mixedUnicode[0].length),
    };
  }

  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(text);
  if (fraction && Number(fraction[2]) !== 0) {
    return {
      value: Number(fraction[1]) / Number(fraction[2]),
      rest: text.slice(fraction[0].length),
    };
  }

  const unicode = /^([½¼¾])/.exec(text);
  if (unicode) {
    return {
      value: UNICODE_FRACTIONS[unicode[1]],
      rest: text.slice(unicode[0].length),
    };
  }

  const decimal = /^(\d+(?:\.\d+)?)/.exec(text);
  if (decimal) {
    return { value: Number(decimal[1]), rest: text.slice(decimal[0].length) };
  }

  return null;
}

/**
 * CAT-6: a measure becomes `quantity` + `unit` only when it starts with a number
 * followed by a word from the fixed unit list (so `oz` and `lb` do not qualify).
 * Anything else keeps quantity empty, `unit: none` and the raw measure in `note`.
 */
export function parseMeasure(
  rawMeasure: string | null | undefined,
): Pick<Ingredient, 'quantity' | 'unit' | 'note'> {
  const raw = (rawMeasure ?? '').trim();
  if (raw.length === 0) return { quantity: null, unit: 'none' };

  const parsed = readNumber(raw);
  if (parsed) {
    const afterNumber = parsed.rest.trimStart();
    const word = /^([a-zA-Z]+)\.?/.exec(afterNumber);
    const unit = word ? UNIT_WORDS[word[1].toLowerCase()] : undefined;
    if (word && unit) {
      const note = afterNumber.slice(word[0].length).trim();
      return note.length > 0
        ? { quantity: round(parsed.value), unit, note }
        : { quantity: round(parsed.value), unit };
    }
    // CAT-6: a bare number ("1", "2 large") counts pieces; any text after it is the note,
    // unless that text starts with a measurement word the app cannot express ("4 oz").
    if (afterNumber.length === 0) {
      return { quantity: round(parsed.value), unit: 'piece' };
    }
    if (!word || !FOREIGN_UNIT_WORDS.has(word[1].toLowerCase())) {
      return {
        quantity: round(parsed.value),
        unit: 'piece',
        note: afterNumber,
      };
    }
  }

  return { quantity: null, unit: 'none', note: raw };
}

/** CAT-6: slots 1..20, skipping both `""` and `null` (and whitespace-only) names. */
export function toIngredients(meal: MealRecord): Ingredient[] {
  const ingredients: Ingredient[] = [];
  for (let slot = 1; slot <= MEAL_SLOT_COUNT; slot += 1) {
    const name = (meal[`strIngredient${slot}`] ?? '').trim();
    if (name.length === 0) continue;
    ingredients.push({ name, ...parseMeasure(meal[`strMeasure${slot}`]) });
  }
  return ingredients;
}

/** CAT-6: a paragraph over 300 characters is split on sentence ends. */
function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_STEP_LENGTH) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [
    paragraph,
  ];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;
    if (current.length === 0) {
      current = trimmed;
    } else if (`${current} ${trimmed}`.length <= MAX_STEP_LENGTH) {
      current = `${current} ${trimmed}`;
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [paragraph];
}

/** CAT-6: `strInstructions` is one blob; split on line breaks, drop empty steps. */
export function toSteps(instructions: string | null | undefined): Step[] {
  const blob = instructions ?? '';
  const steps: Step[] = [];
  for (const line of blob.split(/\r\n|\r|\n/)) {
    const paragraph = line.trim().replace(STEP_NUMBER_PREFIX, '').trim();
    if (paragraph.length === 0) continue;
    for (const chunk of splitLongParagraph(paragraph)) {
      const text = chunk.trim();
      if (text.length > 0) steps.push({ text });
    }
  }
  return steps;
}

/** CAT-4, CAT-5, CAT-6: the meal object as recipe content (the source has no times). */
export function toRecipeContent(meal: MealRecord): RecipeContent {
  return {
    title: (meal.strMeal ?? '').trim(),
    category: isCategory(meal.strCategory)
      ? meal.strCategory
      : FALLBACK_CATEGORY,
    servings: DEFAULT_CATALOGUE_SERVINGS,
    ingredients: toIngredients(meal),
    steps: toSteps(meal.strInstructions),
  };
}

/** CAT-6, DISC-9: a `filter.php` row as a Discover catalogue entry. */
export function toCatalogueItem(
  row: MealFilterRow,
  category: Category,
): CatalogueItemDto {
  return {
    mealId: row.idMeal,
    name: (row.strMeal ?? '').trim(),
    thumbnailUrl: row.strMealThumb ?? '',
    category,
  };
}

/** CAT-2, CAT-6: the full catalogue preview Discover serves from `lookup.php`. */
export function toCataloguePreview(meal: MealRecord): CataloguePreviewDto {
  return {
    ...toRecipeContent(meal),
    mealId: meal.idMeal,
    thumbnailUrl: meal.strMealThumb ?? '',
    area:
      meal.strArea && meal.strArea.trim().length > 0
        ? meal.strArea.trim()
        : null,
    attribution: THEMEALDB_ATTRIBUTION,
  };
}

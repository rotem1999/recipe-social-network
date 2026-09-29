// SPEC.md §3–§6, §11.5: domain types, enums and invariants. Pure TypeScript, no runtime
// dependencies (libs/shared/CLAUDE.md).

/** REC-1..3, §3.1 visibility states. */
export const VISIBILITIES = ['private', 'shared', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** DISC-7: TheMealDB's 14 categories, one per recipe (DISC-8). */
export const CATEGORIES = [
  'Beef',
  'Breakfast',
  'Chicken',
  'Dessert',
  'Goat',
  'Lamb',
  'Miscellaneous',
  'Pasta',
  'Pork',
  'Seafood',
  'Side',
  'Starter',
  'Vegan',
  'Vegetarian',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** §3.1.1 ingredient units (fixed list). */
export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'pinch', 'none'] as const;
export type Unit = (typeof UNITS)[number];

/** §3.1.1 ingredients[]: quantity empty (null) means "to taste". */
export interface Ingredient {
  quantity: number | null;
  unit: Unit;
  name: string;
  note?: string;
}

/** §3.1.1 steps[]: durationMinutes shows a timer in cook mode. */
export interface Step {
  text: string;
  durationMinutes?: number;
}

/** §3.1.1 recipe fields that a version carries (images are object paths, IMG-3). */
export interface RecipeContent {
  title: string;
  description?: string;
  category: Category;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  prepMinutes?: number;
  cookMinutes?: number;
}

/** Where a recipe came from (CAT-3, §12.1 recipes.source). */
export const RECIPE_SOURCES = ['user', 'themealdb'] as const;
export type RecipeSource = (typeof RECIPE_SOURCES)[number];

/** How the caller relates to a recipe (§11.6 GET /recipes). */
export const RECIPE_RELATIONS = ['own', 'saved', 'shared', 'public', 'none'] as const;
export type RecipeRelation = (typeof RECIPE_RELATIONS)[number];

/** RATE-1: whole stars 1–5. RATE-2: average 1.00–5.00. */
export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** DISC-6: favourite categories pinned in Discover. */
export const MAX_FAVOURITE_CATEGORIES = 3;

/** CAT-4: catalogue imports get 2 servings. */
export const DEFAULT_CATALOGUE_SERVINGS = 2;

/** IMG-6 limits. */
export const MAX_IMAGES_PER_RECIPE = 3;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** AUTH-5 limits. */
export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** COM-3 and COOK-10 limits. */
export const COMMENT_MAX_LENGTH = 2000;
export const COOK_QUESTION_MAX_LENGTH = 500;

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value);
}

export function isWholeStars(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= MIN_STARS && (value as number) <= MAX_STARS;
}

/** RATE-3: the average rendered in quarter-star steps (0.25 granularity). */
export function roundToQuarter(average: number): number {
  return Math.round(average * 4) / 4;
}

/** RATE-2: average with two decimals as the API returns it. */
export function toTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/** §3.1.1 invariants. Returns an empty list when the content is valid. */
export function validateRecipeContent(content: RecipeContent): string[] {
  const errors: string[] = [];
  if (!content.title || content.title.trim().length === 0) errors.push('title is required');
  if (content.title && content.title.length > 200) errors.push('title is longer than 200 characters');
  if (content.description !== undefined && content.description.length > 500) {
    errors.push('description is longer than 500 characters');
  }
  if (!isCategory(content.category)) errors.push('category must be one of the 14 categories');
  if (!Number.isInteger(content.servings) || content.servings < 1) errors.push('servings must be an integer >= 1');
  if (!Array.isArray(content.ingredients) || content.ingredients.length === 0) {
    errors.push('at least one ingredient is required');
  } else {
    content.ingredients.forEach((ingredient, index) => {
      if (!ingredient.name || ingredient.name.trim().length === 0) errors.push(`ingredient ${index + 1}: name is required`);
      if (!isUnit(ingredient.unit)) errors.push(`ingredient ${index + 1}: unit is not in the fixed list`);
      if (ingredient.quantity !== null && !(typeof ingredient.quantity === 'number' && ingredient.quantity >= 0)) {
        errors.push(`ingredient ${index + 1}: quantity must be a non-negative number or empty`);
      }
    });
  }
  if (!Array.isArray(content.steps) || content.steps.length === 0) {
    errors.push('at least one step is required');
  } else {
    content.steps.forEach((step, index) => {
      if (!step.text || step.text.trim().length === 0) errors.push(`step ${index + 1}: text is required`);
      if (step.durationMinutes !== undefined && !(Number.isInteger(step.durationMinutes) && step.durationMinutes >= 1)) {
        errors.push(`step ${index + 1}: durationMinutes must be an integer >= 1`);
      }
    });
  }
  for (const key of ['prepMinutes', 'cookMinutes'] as const) {
    const value = content[key];
    if (value !== undefined && !(Number.isInteger(value) && value >= 0)) errors.push(`${key} must be an integer >= 0`);
  }
  return errors;
}

/** UI-14: ingredient quantities rescaled for a different servings count (display only). */
export function scaleQuantity(quantity: number | null, fromServings: number, toServings: number): number | null {
  if (quantity === null || fromServings <= 0) return quantity;
  return Math.round((quantity * toServings * 100) / fromServings) / 100;
}

/** UI-10: total minutes shown on cards, undefined when both are absent. */
export function totalMinutes(content: Pick<RecipeContent, 'prepMinutes' | 'cookMinutes'>): number | undefined {
  if (content.prepMinutes === undefined && content.cookMinutes === undefined) return undefined;
  return (content.prepMinutes ?? 0) + (content.cookMinutes ?? 0);
}

/** UI-10: greeting from the local hour. */
export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour <= 11) return 'Good morning';
  if (hour >= 12 && hour <= 17) return 'Good afternoon';
  return 'Good evening';
}

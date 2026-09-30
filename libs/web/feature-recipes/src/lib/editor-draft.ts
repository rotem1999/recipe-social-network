// SPEC.md §11.5 UI-35: the editor keeps its unsaved fields in sessionStorage
// (`cookbook.draft`, with the user id and the recipe id or "new") while they
// differ from what it opened with, and restores them when that user opens the
// same editor again after a session ended or a reload; Save and Discard clear
// the draft. Every sessionStorage access is guarded: storage can be disabled
// or full, and the editor then simply starts from what it opened with.
import type { Category, Ingredient, Step } from '@rsn/shared/util-domain';
import { isCategory, isUnit } from '@rsn/shared/util-domain';

/** UI-35: the sessionStorage key that holds the editor's unsaved fields. */
export const DRAFT_STORAGE_KEY = 'cookbook.draft';

/** UI-35: the draft's target, the edited recipe's id or "new" on create. */
export const NEW_RECIPE_DRAFT_TARGET = 'new';

/** UI-35: the editor's fields as they are kept (picked files are not). */
export interface EditorDraftFields {
  title: string;
  description: string;
  category: Category | '';
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  ingredients: Ingredient[];
  steps: Step[];
}

/** What is stored under {@link DRAFT_STORAGE_KEY}. */
interface StoredDraft {
  userId: string;
  target: string;
  fields: EditorDraftFields;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rebuilds one ingredient row; anything malformed drops the whole draft. */
function parseIngredient(value: unknown): Ingredient | null {
  if (!isRecord(value)) {
    return null;
  }
  const { quantity, unit, name, note } = value;
  if (
    !(quantity === null || (typeof quantity === 'number' && Number.isFinite(quantity))) ||
    !isUnit(unit) ||
    !isString(name) ||
    !(note === undefined || isString(note))
  ) {
    return null;
  }
  return note === undefined
    ? { quantity, unit, name }
    : { quantity, unit, name, note };
}

/** Rebuilds one step row; anything malformed drops the whole draft. */
function parseStep(value: unknown): Step | null {
  if (!isRecord(value)) {
    return null;
  }
  const { text, durationMinutes } = value;
  if (
    !isString(text) ||
    !(
      durationMinutes === undefined ||
      (typeof durationMinutes === 'number' && Number.isInteger(durationMinutes))
    )
  ) {
    return null;
  }
  return durationMinutes === undefined ? { text } : { text, durationMinutes };
}

/** Rebuilds the fields from stored JSON, or null when anything is off. */
function parseFields(value: unknown): EditorDraftFields | null {
  if (!isRecord(value)) {
    return null;
  }
  const {
    title,
    description,
    category,
    servings,
    prepMinutes,
    cookMinutes,
    ingredients,
    steps,
  } = value;
  if (
    !isString(title) ||
    !isString(description) ||
    !(category === '' || isCategory(category)) ||
    !isString(servings) ||
    !isString(prepMinutes) ||
    !isString(cookMinutes) ||
    !Array.isArray(ingredients) ||
    !Array.isArray(steps) ||
    ingredients.length === 0 ||
    steps.length === 0
  ) {
    return null;
  }
  const parsedIngredients = ingredients.map(parseIngredient);
  const parsedSteps = steps.map(parseStep);
  if (
    parsedIngredients.some((row) => row === null) ||
    parsedSteps.some((row) => row === null)
  ) {
    return null;
  }
  return {
    title,
    description,
    category,
    servings,
    prepMinutes,
    cookMinutes,
    ingredients: parsedIngredients as Ingredient[],
    steps: parsedSteps as Step[],
  };
}

/**
 * UI-35: the fields kept for `userId` on `target` (a recipe id or "new"), or
 * null when there is no draft, it belongs to another user or another editor,
 * or sessionStorage is unavailable or holds something else.
 */
export function readEditorDraft(
  userId: string,
  target: string,
): EditorDraftFields | null {
  let text: string | null;
  try {
    text = globalThis.sessionStorage?.getItem(DRAFT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) {
    return null;
  }
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(saved) ||
    saved['userId'] !== userId ||
    saved['target'] !== target
  ) {
    return null;
  }
  return parseFields(saved['fields']);
}

/** UI-35: keeps the editor's unsaved fields for `userId` on `target`. */
export function writeEditorDraft(
  userId: string,
  target: string,
  fields: EditorDraftFields,
): void {
  const saved: StoredDraft = { userId, target, fields };
  try {
    globalThis.sessionStorage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Disabled or full storage: the draft is simply not kept (UI-35).
  }
}

/** UI-35: drops the kept draft (Save, Discard, or an editor that opened clean). */
export function clearEditorDraft(): void {
  try {
    globalThis.sessionStorage?.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Disabled storage holds no draft to clear.
  }
}

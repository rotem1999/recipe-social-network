// SPEC.md §3.1.1, REC-1/REC-6/REC-7, IMG-3/IMG-6, UI-11, UI-25, UI-31 and UI-45:
// the full recipe editor. Create saves a private version 1; edit saves a new version.
// Client-side validation shows each message under its own field (UI-31);
// `validateRecipeContent` from `@rsn/shared/util-domain` stays the last check.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type {
  RecipeDetailDto,
  RecipeWriteRequest,
} from '@rsn/shared/util-contracts';
import type { Category, Ingredient, Step } from '@rsn/shared/util-domain';
import {
  CATEGORIES,
  IMAGE_MIME_TYPES,
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  MAX_IMAGES_PER_RECIPE,
  MAX_IMAGE_BYTES,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_QUANTITY,
  MAX_PREP_COOK_MINUTES,
  MAX_SERVINGS,
  MAX_STEPS,
  MAX_STEP_DURATION_MINUTES,
  MIN_PREP_COOK_MINUTES,
  MIN_SERVINGS,
  MIN_STEP_DURATION_MINUTES,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  STEP_TEXT_MAX_LENGTH,
  UNITS,
  isCategory,
  isUnit,
  validateRecipeContent,
} from '@rsn/shared/util-domain';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import { setUploadNotice, uploadNoticeText } from './upload-notice';
import {
  Button,
  ConfirmDialog,
  Field,
  Icon,
  InlineError,
  Input,
  Select,
  Textarea,
  WashedImage,
} from '@rsn/web/ui';
import type { TextareaProps } from '@rsn/web/ui';

export interface RecipeEditorScreenProps {
  /** Omitted on create (REC-1); the recipe being edited otherwise (REC-6). */
  recipeId?: string;
  onSaved: (recipe: RecipeDetailDto) => void;
  onCancel: () => void;
  /**
   * UI-40: told whether the fields differ from what the editor opened with, so
   * the shell can ask "Discard your changes?" before it navigates or signs out.
   * The editor reports false when it unmounts.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

const CATEGORY_OPTIONS = CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));

const UNIT_OPTIONS = UNITS.map((unit) => ({ value: unit, label: unit }));

const EMPTY_INGREDIENT: Ingredient = { quantity: null, unit: 'none', name: '' };
const EMPTY_STEP: Step = { text: '' };

/** An optional integer field: empty text means "not set" (§3.1.1). */
function parseOptionalInt(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

/**
 * UI-45: a step's text is a two-row textarea that grows with its text, so a
 * step of up to 1000 characters (§3.1.1) is shown whole while it is written.
 */
function GrowingTextarea(props: TextareaProps): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const { value } = props;
  useLayoutEffect(() => {
    const area = box.current?.querySelector('textarea');
    if (area === null || area === undefined) {
      return;
    }
    // Shrink first, so deleted lines give their height back; the border is
    // added because scrollHeight covers only the content and padding.
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
  }, [value]);
  return (
    <div ref={box}>
      <Textarea rows={2} {...props} />
    </div>
  );
}

/** UI-31: one message per field id, in the order the fields appear on screen. */
type FieldProblem = readonly [id: string, message: string];

/** UI-31: the ids of the per-row controls, so a message can point at its field. */
const ids = {
  quantity: (index: number): string => `ingredient-quantity-${index}`,
  ingredient: (index: number): string => `ingredient-name-${index}`,
  note: (index: number): string => `ingredient-note-${index}`,
  step: (index: number): string => `step-text-${index}`,
  stepMinutes: (index: number): string => `step-minutes-${index}`,
};

/** UI-31: the row moved one place up (-1) or down (+1); out of range leaves the list. */
function moveItem<T>(list: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** IMG-6: the client-side half of the upload limits. */
function imageProblem(file: File, count: number): string | null {
  if (count >= MAX_IMAGES_PER_RECIPE) {
    return `At most ${MAX_IMAGES_PER_RECIPE} images per recipe.`;
  }
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Images must be JPEG, PNG or WebP.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Images must be 5 MB or smaller.';
  }
  return null;
}

/** UI-40: the editable fields, compared with what the editor opened with. */
interface EditorFields {
  title: string;
  description: string;
  category: Category | '';
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  ingredients: readonly Ingredient[];
  steps: readonly Step[];
  /** On create, picked files are lost when the editor is left (IMG-3). */
  pendingFiles: number;
}

/** UI-40: a comparable form of the fields; an empty note equals no note. */
function snapshotOf(fields: EditorFields): string {
  return JSON.stringify({
    ...fields,
    ingredients: fields.ingredients.map((ingredient) => ({
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      name: ingredient.name,
      note: ingredient.note ?? '',
    })),
    steps: fields.steps.map((step) => ({
      text: step.text,
      durationMinutes: step.durationMinutes ?? null,
    })),
  });
}

const EMPTY_SNAPSHOT = snapshotOf({
  title: '',
  description: '',
  category: '',
  servings: '2',
  prepMinutes: '',
  cookMinutes: '',
  ingredients: [EMPTY_INGREDIENT],
  steps: [EMPTY_STEP],
  pendingFiles: 0,
});

/**
 * UI-40 / IMG-7: whether a signed image URL points at an object uploaded to this
 * recipe, whose path is `recipes/<recipeId>/<uuid>.<ext>` (IMG-6).
 */
function ownsImage(url: string, recipeId: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return false;
  }
  const match = /\/recipes\/([^/]+)\/[^/]+$/.exec(path);
  return match !== null && match[1] === recipeId;
}

/** UI-11: the one editor behind both "New recipe" and the owner's Edit action. */
export function RecipeEditorScreen({
  recipeId,
  onSaved,
  onCancel,
  onDirtyChange,
}: RecipeEditorScreenProps): ReactElement {
  const api = useApi();
  const isEdit = recipeId !== undefined;
  const { data: existing, error: loadError } =
    useRequest<RecipeDetailDto | null>(
      () =>
        recipeId === undefined
          ? Promise.resolve(null)
          : api.getRecipe(recipeId),
      [recipeId],
    );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // UI-31: a new recipe has no default category.
  const [category, setCategory] = useState<Category | ''>('');
  const [servings, setServings] = useState('2');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [cookMinutes, setCookMinutes] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { ...EMPTY_INGREDIENT },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ ...EMPTY_STEP }]);
  // UI-31: stable row keys, so Move up / Move down keeps focus on the moved row.
  const nextKey = useRef(2);
  const newKey = (): number => nextKey.current++;
  const [ingredientKeys, setIngredientKeys] = useState<number[]>([0]);
  const [stepKeys, setStepKeys] = useState<number[]>([1]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  /** On create the files wait here and are uploaded after `POST /recipes` (IMG-3). */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  /** UI-31: field id → its message. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  /** Anything `validateRecipeContent` still finds after the per-field checks. */
  const [errors, setErrors] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /** UI-40: what the editor opened with; the loaded version on edit. */
  const [baseline, setBaseline] = useState(EMPTY_SNAPSHOT);
  /** UI-40: the uploaded image or the picked file waiting for "Remove this photo?". */
  const [removingImage, setRemovingImage] = useState<{
    kind: 'uploaded' | 'pending';
    index: number;
  } | null>(null);

  // REC-6: Edit opens the same editor pre-filled with the current version (UI-11).
  useEffect(() => {
    if (existing === null) {
      return;
    }
    setTitle(existing.title);
    setDescription(existing.description ?? '');
    setCategory(existing.category);
    setServings(String(existing.servings));
    setPrepMinutes(
      existing.prepMinutes === undefined ? '' : String(existing.prepMinutes),
    );
    setCookMinutes(
      existing.cookMinutes === undefined ? '' : String(existing.cookMinutes),
    );
    const loadedIngredients =
      existing.ingredients.length === 0
        ? [{ ...EMPTY_INGREDIENT }]
        : existing.ingredients.map((ingredient) => ({ ...ingredient }));
    const loadedSteps =
      existing.steps.length === 0
        ? [{ ...EMPTY_STEP }]
        : existing.steps.map((step) => ({ ...step }));
    setIngredients(loadedIngredients);
    setSteps(loadedSteps);
    setIngredientKeys(loadedIngredients.map(() => nextKey.current++));
    setStepKeys(loadedSteps.map(() => nextKey.current++));
    setImageUrls([...existing.imageUrls]);
    // UI-40: the loaded version is what the edit opened with.
    setBaseline(
      snapshotOf({
        title: existing.title,
        description: existing.description ?? '',
        category: existing.category,
        servings: String(existing.servings),
        prepMinutes:
          existing.prepMinutes === undefined ? '' : String(existing.prepMinutes),
        cookMinutes:
          existing.cookMinutes === undefined ? '' : String(existing.cookMinutes),
        ingredients: loadedIngredients,
        steps: loadedSteps,
        pendingFiles: 0,
      }),
    );
  }, [existing]);

  // UI-40: whether the fields differ from what the editor opened with.
  const dirty =
    snapshotOf({
      title,
      description,
      category,
      servings,
      prepMinutes,
      cookMinutes,
      ingredients,
      steps,
      pendingFiles: pendingFiles.length,
    }) !== baseline;

  // UI-40: the shell asks before leaving a dirty editor; unmounting clears it.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  /** UI-31: editing a field drops its message. */
  const clearError = (id: string): void =>
    setFieldErrors((previous) => {
      if (previous[id] === undefined) {
        return previous;
      }
      const next = { ...previous };
      delete next[id];
      return next;
    });

  /** UI-31: row messages are keyed by position, so a reorder or removal drops them. */
  const clearRowErrors = (): void =>
    setFieldErrors((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(
          ([id]) => !id.startsWith('ingredient-') && !id.startsWith('step-'),
        ),
      ),
    );

  const patchIngredient = (index: number, patch: Partial<Ingredient>): void =>
    setIngredients((previous) =>
      previous.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const patchStep = (index: number, patch: Partial<Step>): void =>
    setSteps((previous) =>
      previous.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const addIngredient = (): void => {
    setIngredients((previous) => [...previous, { ...EMPTY_INGREDIENT }]);
    setIngredientKeys((previous) => [...previous, newKey()]);
  };

  const removeIngredient = (index: number): void => {
    setIngredients((previous) => previous.filter((_, i) => i !== index));
    setIngredientKeys((previous) => previous.filter((_, i) => i !== index));
    clearRowErrors();
  };

  const moveIngredient = (index: number, offset: -1 | 1): void => {
    setIngredients((previous) => moveItem(previous, index, offset));
    setIngredientKeys((previous) => moveItem(previous, index, offset));
    clearRowErrors();
  };

  const addStep = (): void => {
    setSteps((previous) => [...previous, { ...EMPTY_STEP }]);
    setStepKeys((previous) => [...previous, newKey()]);
  };

  const removeStep = (index: number): void => {
    setSteps((previous) => previous.filter((_, i) => i !== index));
    setStepKeys((previous) => previous.filter((_, i) => i !== index));
    clearRowErrors();
  };

  const moveStep = (index: number, offset: -1 | 1): void => {
    setSteps((previous) => moveItem(previous, index, offset));
    setStepKeys((previous) => moveItem(previous, index, offset));
    clearRowErrors();
  };

  /** UI-31: `aria-invalid` and the message's id on an invalid control. */
  const invalidProps = (
    id: string,
  ): { 'aria-invalid'?: true; 'aria-describedby'?: string } =>
    fieldErrors[id] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `${id}-error` };

  /** UI-31: the message under its own field. */
  const errorFor = (id: string): ReactElement | null =>
    fieldErrors[id] === undefined ? null : (
      <div id={`${id}-error`}>
        <InlineError>{fieldErrors[id]}</InlineError>
      </div>
    );

  const message = (cause: unknown): string =>
    cause instanceof ApiError || cause instanceof Error
      ? cause.message
      : 'Something went wrong.';

  /** §3.1.1: what `POST /recipes` and `PUT /recipes/:id` take (§11.6). */
  const buildContent = (chosen: Category): RecipeWriteRequest => ({
    title: title.trim(),
    description: description.trim() === '' ? undefined : description.trim(),
    category: chosen,
    servings: parseOptionalInt(servings) ?? 0,
    ingredients: ingredients.map((ingredient) => ({
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      name: ingredient.name.trim(),
      note:
        ingredient.note === undefined || ingredient.note.trim() === ''
          ? undefined
          : ingredient.note.trim(),
    })),
    steps: steps.map((step) => ({
      text: step.text.trim(),
      durationMinutes: step.durationMinutes,
    })),
    prepMinutes: parseOptionalInt(prepMinutes),
    cookMinutes: parseOptionalInt(cookMinutes),
  });

  /** IMG-3: edit uploads at once; create keeps the file until the recipe exists. */
  const onPickFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (fileInput.current !== null) {
      fileInput.current.value = '';
    }
    if (file === undefined) {
      return;
    }
    const problem = imageProblem(file, imageUrls.length + pendingFiles.length);
    if (problem !== null) {
      setImageError(problem);
      return;
    }
    setImageError(null);
    if (recipeId === undefined) {
      setPendingFiles((previous) => [...previous, file]);
      return;
    }
    try {
      const response = await api.uploadImage(recipeId, file);
      setImageUrls(response.imageUrls);
    } catch (cause: unknown) {
      setImageError(message(cause));
    }
  };

  /** UI-40: runs after "Remove this photo?"; the removal applies at once (IMG-7). */
  const removeImage = async (index: number): Promise<void> => {
    setRemovingImage(null);
    if (recipeId === undefined) {
      return;
    }
    setImageError(null);
    try {
      const response = await api.deleteImage(recipeId, index);
      setImageUrls(response.imageUrls);
    } catch (cause: unknown) {
      setImageError(message(cause));
    }
  };

  /** UI-31: the per-field checks, in the order the fields appear on screen. */
  const fieldProblems = (): FieldProblem[] => {
    const problems: FieldProblem[] = [];
    // §3.1.1 upper limits: rows saved before them keep longer values until the
    // next edit, so a too-long field gets its own message too (UI-31).
    if (title.trim() === '') {
      problems.push(['recipe-title', 'Give the recipe a title']);
    } else if (title.trim().length > RECIPE_TITLE_MAX_LENGTH) {
      problems.push([
        'recipe-title',
        `Title can be at most ${RECIPE_TITLE_MAX_LENGTH} characters`,
      ]);
    }
    if (description.trim().length > RECIPE_DESCRIPTION_MAX_LENGTH) {
      problems.push([
        'recipe-description',
        `Description can be at most ${RECIPE_DESCRIPTION_MAX_LENGTH} characters`,
      ]);
    }
    if (category === '') {
      problems.push(['recipe-category', 'Choose a category']);
    }
    const servingsValue = parseOptionalInt(servings);
    if (servingsValue === undefined || servingsValue < MIN_SERVINGS) {
      problems.push(['recipe-servings', 'Servings must be at least 1']);
    } else if (servingsValue > MAX_SERVINGS) {
      problems.push([
        'recipe-servings',
        `Servings can be at most ${MAX_SERVINGS}`,
      ]);
    }
    const prep = parseOptionalInt(prepMinutes);
    if (prep !== undefined && prep < MIN_PREP_COOK_MINUTES) {
      problems.push(['recipe-prep', "Prep minutes can't be negative"]);
    } else if (prep !== undefined && prep > MAX_PREP_COOK_MINUTES) {
      problems.push([
        'recipe-prep',
        `Prep minutes can be at most ${MAX_PREP_COOK_MINUTES}`,
      ]);
    }
    const cook = parseOptionalInt(cookMinutes);
    if (cook !== undefined && cook < MIN_PREP_COOK_MINUTES) {
      problems.push(['recipe-cook', "Cook minutes can't be negative"]);
    } else if (cook !== undefined && cook > MAX_PREP_COOK_MINUTES) {
      problems.push([
        'recipe-cook',
        `Cook minutes can be at most ${MAX_PREP_COOK_MINUTES}`,
      ]);
    }
    ingredients.forEach((ingredient, index) => {
      if (
        ingredient.quantity !== null &&
        !(Number.isFinite(ingredient.quantity) && ingredient.quantity >= 0)
      ) {
        problems.push([ids.quantity(index), "Quantity can't be negative"]);
      } else if (ingredient.quantity === 0) {
        // §3.1.1: a quantity is above 0 when present; empty means "to taste".
        problems.push([ids.quantity(index), 'Quantity must be more than 0']);
      } else if (
        ingredient.quantity !== null &&
        ingredient.quantity > MAX_INGREDIENT_QUANTITY
      ) {
        problems.push([
          ids.quantity(index),
          `Quantity can be at most ${MAX_INGREDIENT_QUANTITY}`,
        ]);
      }
      if (ingredient.name.trim() === '') {
        problems.push([ids.ingredient(index), 'Name this ingredient']);
      } else if (ingredient.name.trim().length > INGREDIENT_NAME_MAX_LENGTH) {
        problems.push([
          ids.ingredient(index),
          `Ingredient names can be at most ${INGREDIENT_NAME_MAX_LENGTH} characters`,
        ]);
      }
      if ((ingredient.note ?? '').trim().length > INGREDIENT_NOTE_MAX_LENGTH) {
        problems.push([
          ids.note(index),
          `Notes can be at most ${INGREDIENT_NOTE_MAX_LENGTH} characters`,
        ]);
      }
    });
    if (ingredients.length > MAX_INGREDIENTS) {
      problems.push([
        ids.ingredient(MAX_INGREDIENTS),
        `A recipe can have at most ${MAX_INGREDIENTS} ingredients`,
      ]);
    }
    steps.forEach((step, index) => {
      if (step.text.trim() === '') {
        problems.push([ids.step(index), 'Write this step']);
      } else if (step.text.trim().length > STEP_TEXT_MAX_LENGTH) {
        problems.push([
          ids.step(index),
          `Steps can be at most ${STEP_TEXT_MAX_LENGTH} characters`,
        ]);
      }
      if (
        step.durationMinutes !== undefined &&
        step.durationMinutes < MIN_STEP_DURATION_MINUTES
      ) {
        problems.push([ids.stepMinutes(index), 'Minutes must be at least 1']);
      } else if (
        step.durationMinutes !== undefined &&
        step.durationMinutes > MAX_STEP_DURATION_MINUTES
      ) {
        problems.push([
          ids.stepMinutes(index),
          `Minutes can be at most ${MAX_STEP_DURATION_MINUTES}`,
        ]);
      }
    });
    if (steps.length > MAX_STEPS) {
      problems.push([
        ids.step(MAX_STEPS),
        `A recipe can have at most ${MAX_STEPS} steps`,
      ]);
    }
    return problems;
  };

  /** UI-31: scrolls to and focuses the first invalid field. */
  const focusField = (id: string): void => {
    const element = document.getElementById(id);
    if (element === null) {
      return;
    }
    element.scrollIntoView?.({ block: 'center' });
    element.focus();
  };

  const submit = async (): Promise<void> => {
    setSubmitError(null);
    const problems = fieldProblems();
    setFieldErrors(Object.fromEntries(problems));
    if (problems.length > 0 || category === '') {
      setErrors([]);
      if (problems.length > 0) {
        focusField(problems[0][0]);
      }
      return;
    }
    const content = buildContent(category);
    const remaining = validateRecipeContent(content);
    setErrors(remaining);
    if (remaining.length > 0) {
      return;
    }
    setBusy(true);
    if (recipeId !== undefined) {
      try {
        onSaved(await api.updateRecipe(recipeId, content));
      } catch (cause: unknown) {
        setSubmitError(message(cause));
        setBusy(false);
      }
      return;
    }
    // REC-1: create first, then the images the user picked while creating (IMG-3).
    let created: RecipeDetailDto;
    try {
      created = await api.createRecipe(content);
    } catch (cause: unknown) {
      setSubmitError(message(cause));
      setBusy(false);
      return;
    }
    // UI-25: the recipe exists now, so the editor always moves on to it; a failed
    // upload becomes a notice on the detail screen instead of a second Create.
    let urls = created.imageUrls;
    let failed = 0;
    let firstFailure: string | null = null;
    for (const file of pendingFiles) {
      try {
        const response = await api.uploadImage(created.id, file);
        urls = response.imageUrls;
      } catch (cause: unknown) {
        failed += 1;
        firstFailure = firstFailure ?? message(cause);
      }
    }
    if (failed > 0 && firstFailure !== null) {
      setUploadNotice(created.id, uploadNoticeText(failed, firstFailure));
    }
    onSaved({ ...created, imageUrls: urls });
  };

  return (
    <main className="screen screen-editor" aria-label="Recipe editor">
      <h1 className="page-title">{isEdit ? 'Edit recipe' : 'New recipe'}</h1>
      <p className="text-muted page-lead">
        {isEdit
          ? 'Saving keeps the earlier versions; every version stays viewable.'
          : 'Starts private — share or publish it whenever you like.'}
      </p>

      {loadError === null ? null : (
        <InlineError>{loadError.message}</InlineError>
      )}

      <div className="stack gap-3">
        <Field label="Title" htmlFor="recipe-title">
          {/* §3.1.1 limits; UI-41: user text carries dir="auto". */}
          <Input
            id="recipe-title"
            dir="auto"
            maxLength={RECIPE_TITLE_MAX_LENGTH}
            value={title}
            {...invalidProps('recipe-title')}
            onChange={(event) => {
              setTitle(event.target.value);
              clearError('recipe-title');
            }}
          />
          {errorFor('recipe-title')}
        </Field>

        <Field label="Description" htmlFor="recipe-description">
          <Textarea
            id="recipe-description"
            dir="auto"
            maxLength={RECIPE_DESCRIPTION_MAX_LENGTH}
            value={description}
            {...invalidProps('recipe-description')}
            onChange={(event) => {
              setDescription(event.target.value);
              clearError('recipe-description');
            }}
          />
          {errorFor('recipe-description')}
        </Field>

        <div className="field-grid">
          <Field label="Category" htmlFor="recipe-category">
            {/* UI-31: starts empty with the placeholder "Choose a category". */}
            <Select
              id="recipe-category"
              value={category}
              {...invalidProps('recipe-category')}
              onChange={(event) => {
                if (isCategory(event.target.value)) {
                  setCategory(event.target.value);
                  clearError('recipe-category');
                }
              }}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {errorFor('recipe-category')}
          </Field>
          <Field label="Servings" htmlFor="recipe-servings">
            <Input
              id="recipe-servings"
              type="number"
              min={MIN_SERVINGS}
              max={MAX_SERVINGS}
              value={servings}
              {...invalidProps('recipe-servings')}
              onChange={(event) => {
                setServings(event.target.value);
                clearError('recipe-servings');
              }}
            />
            {errorFor('recipe-servings')}
          </Field>
          <Field label="Prep minutes" htmlFor="recipe-prep">
            <Input
              id="recipe-prep"
              type="number"
              min={MIN_PREP_COOK_MINUTES}
              max={MAX_PREP_COOK_MINUTES}
              value={prepMinutes}
              {...invalidProps('recipe-prep')}
              onChange={(event) => {
                setPrepMinutes(event.target.value);
                clearError('recipe-prep');
              }}
            />
            {errorFor('recipe-prep')}
          </Field>
          <Field label="Cook minutes" htmlFor="recipe-cook">
            <Input
              id="recipe-cook"
              type="number"
              min={MIN_PREP_COOK_MINUTES}
              max={MAX_PREP_COOK_MINUTES}
              value={cookMinutes}
              {...invalidProps('recipe-cook')}
              onChange={(event) => {
                setCookMinutes(event.target.value);
                clearError('recipe-cook');
              }}
            />
            {errorFor('recipe-cook')}
          </Field>
        </div>

        {/* §3.1.1: structured ingredients, the unit from the fixed list. */}
        <h4 className="editor-heading">Ingredients</h4>
        {ingredients.map((ingredient, index) => (
          <div
            key={ingredientKeys[index] ?? `row-${index}`}
            className="row align-start wrap"
          >
            <div className="editor-narrow">
              <Input
                id={ids.quantity(index)}
                aria-label={`Quantity ${index + 1}`}
                placeholder="Qty"
                type="number"
                min={0}
                max={MAX_INGREDIENT_QUANTITY}
                step="any"
                value={
                  ingredient.quantity === null
                    ? ''
                    : String(ingredient.quantity)
                }
                {...invalidProps(ids.quantity(index))}
                onChange={(event) => {
                  patchIngredient(index, {
                    quantity:
                      event.target.value.trim() === ''
                        ? null
                        : Number(event.target.value),
                  });
                  clearError(ids.quantity(index));
                }}
              />
              {errorFor(ids.quantity(index))}
            </div>
            <Select
              aria-label={`Unit ${index + 1}`}
              style={{ width: '100px' }}
              value={ingredient.unit}
              options={UNIT_OPTIONS}
              onChange={(event) => {
                const unit: string = event.target.value;
                if (isUnit(unit)) {
                  patchIngredient(index, { unit });
                }
              }}
            />
            <div style={{ flex: 2, minWidth: '140px' }}>
              <Input
                id={ids.ingredient(index)}
                aria-label={`Ingredient ${index + 1}`}
                placeholder="Ingredient"
                dir="auto"
                maxLength={INGREDIENT_NAME_MAX_LENGTH}
                value={ingredient.name}
                {...invalidProps(ids.ingredient(index))}
                onChange={(event) => {
                  patchIngredient(index, { name: event.target.value });
                  clearError(ids.ingredient(index));
                }}
              />
              {errorFor(ids.ingredient(index))}
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <Input
                id={ids.note(index)}
                aria-label={`Note ${index + 1}`}
                placeholder="Note"
                dir="auto"
                maxLength={INGREDIENT_NOTE_MAX_LENGTH}
                value={ingredient.note ?? ''}
                {...invalidProps(ids.note(index))}
                onChange={(event) => {
                  patchIngredient(index, { note: event.target.value });
                  clearError(ids.note(index));
                }}
              />
              {errorFor(ids.note(index))}
            </div>
            {/* UI-31: Move up / Move down reorder the ingredient list. */}
            <Button
              variant="icon"
              aria-label={`Move ingredient ${index + 1} up`}
              title="Move up"
              disabled={index === 0}
              onClick={() => moveIngredient(index, -1)}
            >
              <Icon.ArrowUp size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label={`Move ingredient ${index + 1} down`}
              title="Move down"
              disabled={index === ingredients.length - 1}
              onClick={() => moveIngredient(index, 1)}
            >
              <Icon.ArrowDown size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label={`Remove ingredient ${index + 1}`}
              disabled={ingredients.length === 1}
              onClick={() => removeIngredient(index)}
            >
              <Icon.X size={14} />
            </Button>
          </div>
        ))}
        {/* §3.1.1: at most 50 ingredients, so Add ingredient hides at the limit. */}
        {ingredients.length >= MAX_INGREDIENTS ? null : (
          <Button
            variant="secondary"
            className="self-start"
            onClick={addIngredient}
          >
            <Icon.Plus size={14} />
            Add ingredient
          </Button>
        )}

        {/* §3.1.1: ordered steps, the optional minutes drive the cook-mode timer. */}
        <h4 className="editor-heading">Steps</h4>
        {steps.map((step, index) => (
          <div
            key={stepKeys[index] ?? `row-${index}`}
            className="row align-start wrap"
          >
            <div style={{ flex: 3, minWidth: '200px' }}>
              {/* UI-45: a growing two-row textarea, at most 1000 characters. */}
              <GrowingTextarea
                id={ids.step(index)}
                className="textarea-grow"
                aria-label={`Step ${index + 1}`}
                placeholder={`Step ${index + 1}`}
                dir="auto"
                maxLength={STEP_TEXT_MAX_LENGTH}
                value={step.text}
                {...invalidProps(ids.step(index))}
                onChange={(event) => {
                  patchStep(index, { text: event.target.value });
                  clearError(ids.step(index));
                }}
              />
              {errorFor(ids.step(index))}
            </div>
            <div className="editor-narrow">
              <Input
                id={ids.stepMinutes(index)}
                aria-label={`Step ${index + 1} minutes`}
                placeholder="min"
                type="number"
                min={MIN_STEP_DURATION_MINUTES}
                max={MAX_STEP_DURATION_MINUTES}
                value={
                  step.durationMinutes === undefined
                    ? ''
                    : String(step.durationMinutes)
                }
                {...invalidProps(ids.stepMinutes(index))}
                onChange={(event) => {
                  patchStep(index, {
                    durationMinutes: parseOptionalInt(event.target.value),
                  });
                  clearError(ids.stepMinutes(index));
                }}
              />
              {errorFor(ids.stepMinutes(index))}
            </div>
            {/* UI-31: Move up / Move down reorder the steps. */}
            <Button
              variant="icon"
              aria-label={`Move step ${index + 1} up`}
              title="Move up"
              disabled={index === 0}
              onClick={() => moveStep(index, -1)}
            >
              <Icon.ArrowUp size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label={`Move step ${index + 1} down`}
              title="Move down"
              disabled={index === steps.length - 1}
              onClick={() => moveStep(index, 1)}
            >
              <Icon.ArrowDown size={14} />
            </Button>
            <Button
              variant="icon"
              aria-label={`Remove step ${index + 1}`}
              disabled={steps.length === 1}
              onClick={() => removeStep(index)}
            >
              <Icon.X size={14} />
            </Button>
          </div>
        ))}
        {/* §3.1.1: at most 60 steps, so Add step hides at the limit. */}
        {steps.length >= MAX_STEPS ? null : (
          <Button
            variant="secondary"
            className="self-start"
            onClick={addStep}
          >
            <Icon.Plus size={14} />
            Add step
          </Button>
        )}

        {/* IMG-6: at most 3 images, 5 MB each, JPEG / PNG / WebP. */}
        <h4 className="editor-heading">Images</h4>
        <div className="row align-start gap-3 wrap">
          {imageUrls.map((url, index) => (
            <div key={url} className="editor-image">
              <WashedImage src={url} alt={`Image ${index + 1}`} seed={title} />
              <Button
                variant="ghost"
                className="text-small"
                onClick={() => setRemovingImage({ kind: 'uploaded', index })}
              >
                <Icon.Trash2 size={13} />
                Remove
              </Button>
            </div>
          ))}
          {pendingFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} className="editor-image">
              <WashedImage alt={file.name} seed={file.name} />
              <Button
                variant="ghost"
                className="text-small"
                onClick={() => setRemovingImage({ kind: 'pending', index })}
              >
                <Icon.Trash2 size={13} />
                {file.name}
              </Button>
            </div>
          ))}
        </div>
        <label className="btn btn-secondary self-start">
          <Icon.ImageIcon size={14} />
          Add image
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_MIME_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={(event) => void onPickFile(event)}
          />
        </label>
        {imageError === null ? null : <InlineError>{imageError}</InlineError>}

        {errors.length === 0 ? null : (
          <ul className="editor-errors">
            {errors.map((problem) => (
              <li key={problem}>
                <InlineError>{problem}</InlineError>
              </li>
            ))}
          </ul>
        )}
        {submitError === null ? null : <InlineError>{submitError}</InlineError>}

        <div className="row mt-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void submit()}
          >
            {isEdit ? 'Save version' : 'Create'}
          </Button>
        </div>
      </div>

      {/* UI-40: removing a photo asks first; on the recipe that owns the
          uploaded image the removal reaches every copy of it (IMG-7). */}
      {removingImage === null ? null : (
        <ConfirmDialog
          title={
            removingImage.kind === 'uploaded' &&
            recipeId !== undefined &&
            ownsImage(imageUrls[removingImage.index] ?? '', recipeId)
              ? 'Remove this photo from your recipe and from every copy of it?'
              : 'Remove this photo?'
          }
          confirmLabel="Remove"
          cancelLabel="Cancel"
          onCancel={() => setRemovingImage(null)}
          onConfirm={() => {
            const { kind, index } = removingImage;
            if (kind === 'uploaded') {
              void removeImage(index);
              return;
            }
            setRemovingImage(null);
            setPendingFiles((previous) =>
              previous.filter((_, i) => i !== index),
            );
          }}
        />
      )}
    </main>
  );
}

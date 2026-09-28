// SPEC.md §3.1.1, REC-1/REC-6/REC-7, IMG-3/IMG-6 and UI-11: the full recipe
// editor. Create saves a private version 1; edit saves a new version. Client-side
// validation is `validateRecipeContent` from `@rsn/shared/util-domain`.
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactElement } from 'react';
import type {
  RecipeDetailDto,
  RecipeWriteRequest,
} from '@rsn/shared/util-contracts';
import type { Category, Ingredient, Step } from '@rsn/shared/util-domain';
import {
  CATEGORIES,
  IMAGE_MIME_TYPES,
  MAX_IMAGES_PER_RECIPE,
  MAX_IMAGE_BYTES,
  UNITS,
  isCategory,
  isUnit,
  validateRecipeContent,
} from '@rsn/shared/util-domain';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import {
  Button,
  Field,
  Icon,
  InlineError,
  Input,
  Select,
  Textarea,
  WashedImage,
} from '@rsn/web/ui';

export interface RecipeEditorScreenProps {
  /** Omitted on create (REC-1); the recipe being edited otherwise (REC-6). */
  recipeId?: string;
  onSaved: (recipe: RecipeDetailDto) => void;
  onCancel: () => void;
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

/** UI-11: the one editor behind both "New recipe" and the owner's Edit action. */
export function RecipeEditorScreen({
  recipeId,
  onSaved,
  onCancel,
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
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [servings, setServings] = useState('2');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [cookMinutes, setCookMinutes] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { ...EMPTY_INGREDIENT },
  ]);
  const [steps, setSteps] = useState<Step[]>([{ ...EMPTY_STEP }]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  /** On create the files wait here and are uploaded after `POST /recipes` (IMG-3). */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
    setIngredients(
      existing.ingredients.length === 0
        ? [{ ...EMPTY_INGREDIENT }]
        : existing.ingredients.map((ingredient) => ({ ...ingredient })),
    );
    setSteps(
      existing.steps.length === 0
        ? [{ ...EMPTY_STEP }]
        : existing.steps.map((step) => ({ ...step })),
    );
    setImageUrls([...existing.imageUrls]);
  }, [existing]);

  const patchIngredient = (index: number, patch: Partial<Ingredient>): void =>
    setIngredients((previous) =>
      previous.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const patchStep = (index: number, patch: Partial<Step>): void =>
    setSteps((previous) =>
      previous.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const message = (cause: unknown): string =>
    cause instanceof ApiError || cause instanceof Error
      ? cause.message
      : 'Something went wrong.';

  /** §3.1.1: what `POST /recipes` and `PUT /recipes/:id` take (§11.6). */
  const buildContent = (): RecipeWriteRequest => ({
    title: title.trim(),
    description: description.trim() === '' ? undefined : description.trim(),
    category,
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

  const removeImage = async (index: number): Promise<void> => {
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

  const submit = async (): Promise<void> => {
    const content = buildContent();
    const problems = validateRecipeContent(content);
    setErrors(problems);
    setSubmitError(null);
    if (problems.length > 0) {
      return;
    }
    setBusy(true);
    try {
      if (recipeId !== undefined) {
        onSaved(await api.updateRecipe(recipeId, content));
        return;
      }
      // REC-1: create first, then the images the user picked while creating (IMG-3).
      const created = await api.createRecipe(content);
      let urls = created.imageUrls;
      for (const file of pendingFiles) {
        const response = await api.uploadImage(created.id, file);
        urls = response.imageUrls;
      }
      onSaved({ ...created, imageUrls: urls });
    } catch (cause: unknown) {
      setSubmitError(message(cause));
      setBusy(false);
    }
  };

  return (
    <main
      className="screen"
      style={{ maxWidth: '760px' }}
      aria-label="Recipe editor"
    >
      <h1 style={{ marginBottom: 'var(--space-1)' }}>
        {isEdit ? 'Edit recipe' : 'New recipe'}
      </h1>
      <p
        className="text-muted"
        style={{ fontSize: '14px', marginBottom: 'var(--space-6)' }}
      >
        {isEdit
          ? 'Saving keeps the earlier versions; every version stays viewable.'
          : 'Starts private — share or publish it whenever you like.'}
      </p>

      {loadError === null ? null : (
        <InlineError>{loadError.message}</InlineError>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
        }}
      >
        <Field label="Title" htmlFor="recipe-title">
          <Input
            id="recipe-title"
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor="recipe-description">
          <Textarea
            id="recipe-description"
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <Field label="Category" htmlFor="recipe-category">
            <Select
              id="recipe-category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(event) => {
                if (isCategory(event.target.value)) {
                  setCategory(event.target.value);
                }
              }}
            />
          </Field>
          <Field label="Servings" htmlFor="recipe-servings">
            <Input
              id="recipe-servings"
              type="number"
              min={1}
              value={servings}
              onChange={(event) => setServings(event.target.value)}
            />
          </Field>
          <Field label="Prep minutes" htmlFor="recipe-prep">
            <Input
              id="recipe-prep"
              type="number"
              min={0}
              value={prepMinutes}
              onChange={(event) => setPrepMinutes(event.target.value)}
            />
          </Field>
          <Field label="Cook minutes" htmlFor="recipe-cook">
            <Input
              id="recipe-cook"
              type="number"
              min={0}
              value={cookMinutes}
              onChange={(event) => setCookMinutes(event.target.value)}
            />
          </Field>
        </div>

        {/* §3.1.1: structured ingredients, the unit from the fixed list. */}
        <h4 style={{ margin: 'var(--space-4) 0 0' }}>Ingredients</h4>
        {ingredients.map((ingredient, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Input
              aria-label={`Quantity ${index + 1}`}
              type="number"
              min={0}
              step="any"
              style={{ width: '90px' }}
              value={
                ingredient.quantity === null ? '' : String(ingredient.quantity)
              }
              onChange={(event) =>
                patchIngredient(index, {
                  quantity:
                    event.target.value.trim() === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
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
            <Input
              aria-label={`Ingredient ${index + 1}`}
              placeholder="Ingredient"
              style={{ flex: 2, minWidth: '140px' }}
              value={ingredient.name}
              onChange={(event) =>
                patchIngredient(index, { name: event.target.value })
              }
            />
            <Input
              aria-label={`Note ${index + 1}`}
              placeholder="Note (chopped…)"
              style={{ flex: 1, minWidth: '120px' }}
              value={ingredient.note ?? ''}
              onChange={(event) =>
                patchIngredient(index, { note: event.target.value })
              }
            />
            <Button
              variant="icon"
              aria-label={`Remove ingredient ${index + 1}`}
              disabled={ingredients.length === 1}
              onClick={() =>
                setIngredients((previous) =>
                  previous.filter((_, i) => i !== index),
                )
              }
            >
              <Icon.X size={14} />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            setIngredients((previous) => [...previous, { ...EMPTY_INGREDIENT }])
          }
        >
          <Icon.Plus size={14} />
          Add ingredient
        </Button>

        {/* §3.1.1: ordered steps, the optional minutes drive the cook-mode timer. */}
        <h4 style={{ margin: 'var(--space-4) 0 0' }}>Steps</h4>
        {steps.map((step, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Input
              aria-label={`Step ${index + 1}`}
              placeholder={`Step ${index + 1}`}
              style={{ flex: 3, minWidth: '200px' }}
              value={step.text}
              onChange={(event) =>
                patchStep(index, { text: event.target.value })
              }
            />
            <Input
              aria-label={`Step ${index + 1} minutes`}
              placeholder="min"
              type="number"
              min={1}
              style={{ width: '90px' }}
              value={
                step.durationMinutes === undefined
                  ? ''
                  : String(step.durationMinutes)
              }
              onChange={(event) =>
                patchStep(index, {
                  durationMinutes: parseOptionalInt(event.target.value),
                })
              }
            />
            <Button
              variant="icon"
              aria-label={`Remove step ${index + 1}`}
              disabled={steps.length === 1}
              onClick={() =>
                setSteps((previous) => previous.filter((_, i) => i !== index))
              }
            >
              <Icon.X size={14} />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            setSteps((previous) => [...previous, { ...EMPTY_STEP }])
          }
        >
          <Icon.Plus size={14} />
          Add step
        </Button>

        {/* IMG-6: at most 3 images, 5 MB each, JPEG / PNG / WebP. */}
        <h4 style={{ margin: 'var(--space-4) 0 0' }}>Images</h4>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}
        >
          {imageUrls.map((url, index) => (
            <div key={url} style={{ width: '160px' }}>
              <WashedImage src={url} alt={`Image ${index + 1}`} seed={title} />
              <Button
                variant="ghost"
                style={{ fontSize: '12px' }}
                onClick={() => void removeImage(index)}
              >
                <Icon.Trash2 size={13} />
                Remove
              </Button>
            </div>
          ))}
          {pendingFiles.map((file, index) => (
            <div key={`${file.name}-${index}`} style={{ width: '160px' }}>
              <WashedImage alt={file.name} seed={file.name} />
              <Button
                variant="ghost"
                style={{ fontSize: '12px' }}
                onClick={() =>
                  setPendingFiles((previous) =>
                    previous.filter((_, i) => i !== index),
                  )
                }
              >
                <Icon.Trash2 size={13} />
                {file.name}
              </Button>
            </div>
          ))}
        </div>
        <label
          className="btn btn-secondary"
          style={{ alignSelf: 'flex-start', cursor: 'pointer' }}
        >
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
          <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
            {errors.map((problem) => (
              <li key={problem}>
                <InlineError>{problem}</InlineError>
              </li>
            ))}
          </ul>
        )}
        {submitError === null ? null : <InlineError>{submitError}</InlineError>}

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-4)',
          }}
        >
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
    </main>
  );
}

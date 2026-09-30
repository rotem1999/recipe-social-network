// CAT-2 / CAT-3 / CAT-4 / CAT-7 + §11.5: the read-only preview of a TheMealDB
// entry, reached from the Discover grid. The only action is "Save to my recipes",
// which pulls the meal into the database as the caller's saved copy (SAVE-7); when
// the caller already has a copy (`myCopyId`, DISC-10) it becomes "In your recipes"
// and a Cook button on that copy.
import { useCallback, useState } from 'react';
import type { ReactElement } from 'react';
import { ingredientAmount, totalMinutes } from '@rsn/shared/util-domain';
import { useApi, useRequest } from '@rsn/web/data-access-api';
import { Button, Icon, InlineError, Tag, WashedImage } from '@rsn/web/ui';
import { errorMessage } from './error-message';

export interface CataloguePreviewScreenProps {
  mealId: string;
  onBack(): void;
  /** CAT-3: the id of the copy the API created, so the shell can open it. */
  onSaved(recipeId: string): void;
  /** DISC-10: opens cook mode on the caller's existing copy of this meal. */
  onCook(recipeId: string): void;
}

export function CataloguePreviewScreen({
  mealId,
  onBack,
  onSaved,
  onCook,
}: CataloguePreviewScreenProps): ReactElement {
  const api = useApi();
  const preview = useRequest(() => api.cataloguePreview(mealId), [mealId]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // CAT-3/CAT-4: the API creates the copy (2 servings by default) and returns it.
  const save = useCallback(async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    try {
      const detail = await api.saveCatalogue(mealId);
      onSaved(detail.id);
    } catch (cause) {
      setSaveError(errorMessage(cause, 'Could not save this recipe.'));
    } finally {
      setSaving(false);
    }
  }, [api, mealId, onSaved]);

  const meal = preview.data;
  const minutes = meal === null ? undefined : totalMinutes(meal);
  const copyId = meal === null ? null : meal.myCopyId;

  return (
    <main className="screen">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <Icon.ArrowLeft size={15} />
        Discover
      </Button>

      {preview.loading ? (
        <p className="text-muted">Loading…</p>
      ) : preview.error !== null || meal === null ? (
        <div>
          <InlineError>
            {errorMessage(preview.error, 'Could not load this recipe.')}
          </InlineError>
          <Button variant="ghost" onClick={preview.reload} className="mt-2">
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="row align-start between gap-6 mb-6">
            <div>
              <div className="tag-row mb-2">
                <Tag tone="neutral">{meal.category}</Tag>
                {meal.area === null ? null : (
                  <Tag tone="accent-2">{meal.area}</Tag>
                )}
                <Tag tone="outline">TheMealDB</Tag>
              </div>
              {/* UI-41: recipe text carries dir="auto". */}
              <h1 dir="auto" className="mb-2">
                {meal.title}
              </h1>
              {meal.description === undefined ? null : (
                <p dir="auto" className="text-muted text-body">
                  {meal.description}
                </p>
              )}
              {/* UI-10: "N min · serves N"; TheMealDB carries no times, so they may be absent. */}
              <div className="card-meta">
                {minutes === undefined ? null : <span>{minutes} min ·</span>}
                <span>serves {meal.servings}</span>
              </div>
            </div>
            <div className="stack align-end no-flex">
              {copyId === null ? (
                // SAVE-1/CAT-3: the only action a catalogue preview offers.
                <Button variant="primary" loading={saving} onClick={save}>
                  <Icon.Download size={15} />
                  Save to my recipes
                </Button>
              ) : (
                // DISC-10 / UI-14: already saved; cook the caller's copy.
                <div className="row">
                  <Tag tone="neutral">In your recipes</Tag>
                  <Button variant="primary" onClick={() => onCook(copyId)}>
                    <Icon.Play size={15} />
                    Cook
                  </Button>
                </div>
              )}
              {saveError === null ? null : (
                <InlineError>{saveError}</InlineError>
              )}
            </div>
          </div>

          <div className="split-columns align-start">
            <div>
              {/* CAT-6: the thumbnail is served by TheMealDB, washed like every photo (UI-3). */}
              <div className="photo-frame">
                <WashedImage
                  src={meal.thumbnailUrl}
                  alt={meal.title}
                  seed={meal.title}
                  height={220}
                />
              </div>
              <h4 className="mt-6">Ingredients</h4>
              <div>
                {meal.ingredients.map((ingredient, index) => {
                  // UI-37 / UI-51 / BUG-030: the shared formatter, as the saved copy
                  // reads; a note that is an amount ("1 Can") fills the amount column.
                  const { amount, note } = ingredientAmount(ingredient);
                  return (
                    <div
                      key={`${ingredient.name}-${index}`}
                      className="measure-row"
                    >
                      {/* UI-41: the amount can be a moved note (UI-37). */}
                      <span className="ingredient-qty measure-qty" dir="auto">
                        {amount}
                      </span>
                      <span dir="auto" className="grow">
                        {ingredient.name}
                      </span>
                      {note === null ? null : (
                        <span dir="auto" className="text-muted text-compact">
                          {note}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4>Steps</h4>
              <ol className="list-reset stack gap-3">
                {meal.steps.map((step, index) => (
                  <li
                    key={`${index}-${step.text.slice(0, 16)}`}
                    className="row align-start gap-3"
                  >
                    <span aria-hidden="true" className="step-number">
                      {index + 1}
                    </span>
                    <span dir="auto" className="text-body grow">
                      {step.text}
                    </span>
                    {step.durationMinutes === undefined ? null : (
                      <Tag tone="accent-2" className="no-flex">
                        {step.durationMinutes} min
                      </Tag>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* §3.3: the attribution string is required on every catalogue surface. */}
          <p className="text-muted text-caption mt-8">
            {meal.attribution}
          </p>
        </>
      )}
    </main>
  );
}

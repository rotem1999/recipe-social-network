// CAT-2 / CAT-3 / CAT-4 / CAT-7 + §11.5: the read-only preview of a TheMealDB
// entry, reached from the Discover grid. The only action is "Save to my recipes",
// which pulls the meal into the database as the caller's saved copy (SAVE-7); when
// the caller already has a copy (`myCopyId`, DISC-10) it becomes "In your recipes"
// and a Cook button on that copy.
import { useCallback, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import type { Ingredient } from '@rsn/shared/util-domain';
import { totalMinutes } from '@rsn/shared/util-domain';
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

const COLUMNS: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 5fr) minmax(0, 7fr)',
  gap: 'var(--space-8)',
  alignItems: 'start',
};

const ROW: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-2) 0',
  borderBottom: '1px solid var(--color-divider)',
  fontSize: '14px',
};

/** §3.1.1: an empty quantity means "to taste"; `none` carries no unit word. */
function measure(ingredient: Ingredient): string {
  if (ingredient.quantity === null) {
    return 'to taste';
  }
  return ingredient.unit === 'none'
    ? String(ingredient.quantity)
    : `${ingredient.quantity} ${ingredient.unit}`;
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
      <Button
        variant="ghost"
        onClick={onBack}
        style={{ marginBottom: 'var(--space-4)' }}
      >
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
          <Button
            variant="ghost"
            onClick={preview.reload}
            style={{ marginTop: 'var(--space-2)' }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-6)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                <Tag tone="neutral">{meal.category}</Tag>
                {meal.area === null ? null : (
                  <Tag tone="accent-2">{meal.area}</Tag>
                )}
                <Tag tone="outline">TheMealDB</Tag>
              </div>
              <h1 style={{ marginBottom: 'var(--space-2)' }}>{meal.title}</h1>
              {meal.description === undefined ? null : (
                <p className="text-muted" style={{ fontSize: '14px' }}>
                  {meal.description}
                </p>
              )}
              {/* UI-10: "N min · serves N"; TheMealDB carries no times, so they may be absent. */}
              <div className="card-meta">
                {minutes === undefined ? null : <span>{minutes} min ·</span>}
                <span>serves {meal.servings}</span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                flex: 'none',
              }}
            >
              {copyId === null ? (
                // SAVE-1/CAT-3: the only action a catalogue preview offers.
                <Button variant="primary" loading={saving} onClick={save}>
                  <Icon.Download size={15} />
                  Save to my recipes
                </Button>
              ) : (
                // DISC-10 / UI-14: already saved; cook the caller's copy.
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
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

          <div style={COLUMNS}>
            <div>
              {/* CAT-6: the thumbnail is served by TheMealDB, washed like every photo (UI-3). */}
              <div
                style={{
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <WashedImage
                  src={meal.thumbnailUrl}
                  alt={meal.title}
                  seed={meal.title}
                  height={220}
                />
              </div>
              <h4 style={{ marginTop: 'var(--space-6)' }}>Ingredients</h4>
              <div>
                {meal.ingredients.map((ingredient, index) => (
                  <div key={`${ingredient.name}-${index}`} style={ROW}>
                    <span
                      style={{
                        minWidth: '64px',
                        fontWeight: 700,
                        color: 'var(--color-accent-700)',
                      }}
                    >
                      {measure(ingredient)}
                    </span>
                    <span style={{ flex: 1 }}>{ingredient.name}</span>
                    {ingredient.note === undefined ? null : (
                      <span className="text-muted" style={{ fontSize: '13px' }}>
                        {ingredient.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4>Steps</h4>
              <ol
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {meal.steps.map((step, index) => (
                  <li
                    key={`${index}-${step.text.slice(0, 16)}`}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      alignItems: 'flex-start',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flex: 'none',
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        background: 'var(--color-accent-100)',
                        color: 'var(--color-accent-800)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ fontSize: '14px', flex: 1 }}>
                      {step.text}
                    </span>
                    {step.durationMinutes === undefined ? null : (
                      <Tag tone="accent-2" style={{ flex: 'none' }}>
                        {step.durationMinutes} min
                      </Tag>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* §3.3: the attribution string is required on every catalogue surface. */}
          <p
            className="text-muted"
            style={{ fontSize: '11px', marginTop: 'var(--space-8)' }}
          >
            {meal.attribution}
          </p>
        </>
      )}
    </main>
  );
}

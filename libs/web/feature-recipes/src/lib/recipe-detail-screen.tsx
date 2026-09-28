// SPEC.md REC-4/REC-7, SAVE-1/2/6, RATE-1..4, COM-1..3, NUT-1..6, IMG-4 and
// UI-12..UI-15, design guide §5: the recipe detail screen. All data goes through
// `useApi()`; every mutation adopts the DTO the API returned (§11.6).
import { useState } from 'react';
import type { ReactElement } from 'react';
import type {
  RecipeAttributionDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import type { Visibility } from '@rsn/shared/util-domain';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import {
  Button,
  Icon,
  InlineError,
  StarAverage,
  StarInput,
  Tag,
  WashedImage,
} from '@rsn/web/ui';
import type { TagTone } from '@rsn/web/ui';
import { CommentsSection } from './comments-section';
import { IngredientsPanel } from './ingredients-panel';
import { NutritionPatch } from './nutrition-patch';
import { OwnerActions } from './owner-actions';
import { VersionsDialog } from './versions-dialog';

export interface RecipeDetailScreenProps {
  recipeId: string;
  /** The screen the viewer came from, on the back button ("Home" / "Discover"). */
  backLabel: string;
  onBack: () => void;
  onCook: (id: string) => void;
  onEdit: (id: string) => void;
  /** REC-6 / SAVE-4: the recipe is gone; the shell goes back to Home. */
  onDeleted: () => void;
  onOpenRecipe: (id: string) => void;
}

const VISIBILITY_TONE: Record<Visibility, TagTone> = {
  private: 'neutral',
  shared: 'accent-2',
  public: 'accent',
};

/** The guide's visibility tag: "Private" / "Shared with 3 friends" / "Public". */
function visibilityLabel(recipe: RecipeDetailDto): string {
  if (recipe.visibility === 'private') {
    return 'Private';
  }
  if (recipe.visibility === 'public') {
    return 'Public';
  }
  const count = recipe.sharedWithUserIds.length;
  return count === 1 ? 'Shared with 1 friend' : `Shared with ${count} friends`;
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError || cause instanceof Error
    ? cause.message
    : 'Something went wrong.';
}

/** SAVE-6: "Forked from …" / "Saved from …", linked when the source still exists. */
function AttributionLine({
  prefix,
  attribution,
  onOpenRecipe,
}: {
  prefix: string;
  attribution: RecipeAttributionDto;
  onOpenRecipe: (id: string) => void;
}): ReactElement {
  const label =
    attribution.ownerUsername === null
      ? attribution.title
      : `${attribution.title} by ${attribution.ownerUsername}`;
  const sourceId = attribution.recipeId;
  return (
    <p
      style={{
        fontSize: '12px',
        color: 'var(--color-accent-2-700)',
        margin: 0,
      }}
    >
      {prefix}{' '}
      {sourceId === null ? (
        label
      ) : (
        <Button
          variant="ghost"
          style={{ fontSize: '12px', padding: 0, color: 'inherit' }}
          onClick={() => onOpenRecipe(sourceId)}
        >
          {label}
        </Button>
      )}
    </p>
  );
}

/** REC-4: the preview of a recipe, with everything the viewer is allowed to do. */
export function RecipeDetailScreen({
  recipeId,
  backLabel,
  onBack,
  onCook,
  onEdit,
  onDeleted,
  onOpenRecipe,
}: RecipeDetailScreenProps): ReactElement {
  const api = useApi();
  const { data, error, loading, reload, setData } = useRequest(
    () => api.getRecipe(recipeId),
    [recipeId],
  );
  const [versionView, setVersionView] = useState<{
    recipe: RecipeDetailDto;
    versionNumber: number;
  } | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const shown = versionView?.recipe ?? data;
  const isVersionView = versionView !== null;

  /** SAVE-1 + UI-14: the button flips before the request, and back on failure. */
  const save = async (): Promise<void> => {
    if (data === null) {
      return;
    }
    const previous = data;
    setActionError(null);
    setData({ ...previous, canCook: true, relation: 'saved' });
    try {
      setData(await api.saveRecipe(previous.id));
    } catch (cause: unknown) {
      setData(previous);
      setActionError(errorMessage(cause));
    }
  };

  /** RATE-1/RATE-4: the summary the API returns replaces the local one. */
  const rate = async (stars: number): Promise<void> => {
    if (data === null) {
      return;
    }
    setActionError(null);
    try {
      const rating = await api.rate(data.id, stars);
      setData((current) =>
        current === null ? current : { ...current, rating },
      );
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    }
  };

  if (loading && shown === null) {
    return (
      <main className="screen" aria-label="Recipe">
        <p className="text-muted">Loading…</p>
      </main>
    );
  }

  if (shown === null) {
    return (
      <main className="screen" aria-label="Recipe">
        <Button variant="ghost" onClick={onBack}>
          <Icon.ArrowLeft size={14} />
          {backLabel}
        </Button>
        <InlineError>
          {error === null ? 'Recipe not found.' : error.message}
        </InlineError>
      </main>
    );
  }

  const needsSave =
    !shown.canCook && shown.visibility === 'public' && shown.relation !== 'own';

  return (
    <main className="screen" style={{ maxWidth: '880px' }} aria-label="Recipe">
      <Button
        variant="ghost"
        style={{ marginBottom: 'var(--space-3)' }}
        onClick={onBack}
      >
        <Icon.ArrowLeft size={14} />
        {backLabel}
      </Button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-2)',
            }}
          >
            <Tag tone="neutral">{shown.category}</Tag>
            <Tag tone={VISIBILITY_TONE[shown.visibility]}>
              {visibilityLabel(shown)}
            </Tag>
            {/* UI-12: the version tag opens the list of versions (REC-7). */}
            <Button
              variant="ghost"
              style={{ padding: 0 }}
              title="Editing creates a new version. Every version of a public recipe stays viewable."
              onClick={() => setVersionsOpen(true)}
            >
              <Tag tone="outline">
                <Icon.History size={11} />
                &nbsp;v{versionView?.versionNumber ?? shown.versionNumber}
              </Tag>
            </Button>
          </div>
          <h1 style={{ marginBottom: 'var(--space-1)' }}>{shown.title}</h1>
          {shown.description === undefined ||
          shown.description === '' ? null : (
            <p
              className="text-muted"
              style={{ fontSize: '15px', maxWidth: '520px' }}
            >
              {shown.description}
            </p>
          )}
          {shown.forkedFrom === null ? null : (
            <AttributionLine
              prefix="Forked from"
              attribution={shown.forkedFrom}
              onOpenRecipe={onOpenRecipe}
            />
          )}
          {shown.savedFrom === null ? null : (
            <AttributionLine
              prefix="Saved from"
              attribution={shown.savedFrom}
              onOpenRecipe={onOpenRecipe}
            />
          )}
        </div>

        {isVersionView ? null : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--space-2)',
            }}
          >
            {shown.canCook ? (
              <Button
                variant="primary"
                style={{ fontSize: '16px', padding: '11px var(--space-6)' }}
                onClick={() => onCook(shown.id)}
              >
                <Icon.Play size={17} />
                Start cooking
              </Button>
            ) : null}
            {needsSave ? (
              <Button
                variant="primary"
                style={{ fontSize: '16px', padding: '11px var(--space-6)' }}
                onClick={() => void save()}
              >
                <Icon.Download size={17} />
                Save to cook
              </Button>
            ) : null}
            {/* UI-13: only public recipes carry a rating summary. */}
            {shown.rating === null ? null : (
              <StarAverage
                average={shown.rating.average}
                count={shown.rating.count}
                size={17}
              />
            )}
          </div>
        )}
      </div>

      {actionError === null ? null : <InlineError>{actionError}</InlineError>}

      {versionView === null ? null : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-3)',
          }}
        >
          <span className="text-muted" style={{ fontSize: '12px' }}>
            Viewing version {versionView.versionNumber}, read-only.
          </span>
          <Button variant="secondary" onClick={() => setVersionView(null)}>
            Back to current
          </Button>
        </div>
      )}

      {/* UI-12: the owner row, and Remove from my recipes on a saved copy (SAVE-4). */}
      {!isVersionView && (shown.canEdit || shown.relation === 'saved') ? (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <OwnerActions
            recipe={shown}
            onEdit={onEdit}
            onChanged={(updated) => setData(updated)}
            onDeleted={onDeleted}
          />
        </div>
      ) : null}

      {/* IMG-4: signed URLs expire; a failed image refetches the recipe. */}
      {shown.imageUrls.length === 0 ? null : (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
          }}
        >
          {shown.imageUrls.map((url, index) => (
            <div key={url} style={{ flex: 1, minWidth: 0 }}>
              <WashedImage
                src={url}
                alt={`${shown.title}, image ${index + 1}`}
                seed={shown.id}
                height={180}
                onError={reload}
              />
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 5fr) minmax(0, 7fr)',
          // The guide's 44px column gap, built from the 4.4px spacing step.
          gap: 'calc(var(--space-1) * 10)',
          marginTop: 'var(--space-8)',
        }}
      >
        <section aria-label="Ingredients">
          <IngredientsPanel
            ingredients={shown.ingredients}
            servings={shown.servings}
          />
          {isVersionView ? null : <NutritionPatch recipeId={shown.id} />}
        </section>

        <section aria-label="Steps">
          <h4 style={{ marginBottom: 'var(--space-3)' }}>Steps</h4>
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
            {shown.steps.map((step, index) => (
              <li
                key={`${index}-${step.text}`}
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    width: '26px',
                    height: '26px',
                    flex: 'none',
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
                <div
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.55,
                    paddingTop: '2px',
                  }}
                >
                  {step.text}
                  {/* UI-15: the minutes tag shows on the detail screen too. */}
                  {step.durationMinutes === undefined ? null : (
                    <Tag
                      tone="accent-2"
                      style={{ marginLeft: 'var(--space-2)' }}
                    >
                      <Icon.Timer size={11} />
                      &nbsp;{step.durationMinutes} min
                    </Tag>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* RATE-1: whole stars, public recipes only (UI-13). */}
          {!isVersionView && shown.canRate ? (
            <>
              <div
                className="hr"
                style={{ margin: 'var(--space-8) 0 var(--space-6)' }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                <h4 style={{ margin: 0 }}>Your rating</h4>
                <StarInput
                  value={shown.rating?.mine ?? null}
                  onRate={(stars) => void rate(stars)}
                />
                {shown.rating?.mine === undefined ||
                shown.rating?.mine === null ? null : (
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--color-accent-2-700)',
                    }}
                  >
                    Counted in the average
                  </span>
                )}
              </div>
              <p
                className="text-muted"
                style={{ fontSize: '12px', marginBottom: 'var(--space-6)' }}
              >
                Whole stars only — the average shows in quarter steps.
              </p>
            </>
          ) : null}

          {/* COM-1: private recipes have no comment section (UI-15). */}
          {!isVersionView && shown.hasComments ? (
            <CommentsSection recipeId={shown.id} hasVotes={shown.hasVotes} />
          ) : null}
        </section>
      </div>

      {shown.attribution === null ? null : (
        <p
          className="text-muted"
          style={{ fontSize: '11px', marginTop: 'var(--space-8)' }}
        >
          {shown.attribution}
        </p>
      )}

      {versionsOpen ? (
        <VersionsDialog
          recipeId={shown.id}
          onPick={(version, versionNumber) =>
            setVersionView(
              versionNumber === shown.versionCount
                ? null
                : { recipe: version, versionNumber },
            )
          }
          onClose={() => setVersionsOpen(false)}
        />
      ) : null}
    </main>
  );
}

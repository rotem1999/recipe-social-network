// SPEC.md REC-4/REC-7, SAVE-1/2/6..10, DISC-10, RATE-1..4, COM-1..3, NUT-1..6,
// IMG-4, UI-12..UI-15, UI-19/20, UI-24/25, UI-29, UI-38, UI-47 and UI-50, design
// guide §5: the recipe detail screen. All data goes through `useApi()`; every
// mutation adopts the DTO the API returned (§11.6).
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  RecipeAttributionDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import type { Visibility } from '@rsn/shared/util-domain';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import {
  Button,
  ConfirmDialog,
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
import { clearUploadNotice, peekUploadNotice } from './upload-notice';
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

/**
 * The guide's visibility tag: "Private" / "Shared with 3 friends" / "Public".
 * UI-19: a recipe shared with the caller reads "Shared with you by <owner>".
 */
function visibilityLabel(recipe: RecipeDetailDto): string {
  if (recipe.relation === 'shared') {
    return `Shared with you by ${recipe.ownerUsername}`;
  }
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

/**
 * UI-50: the SAVE-9 source label — only the source's title is the directional
 * element (dir="auto"); "by <owner>" and "on TheMealDB" follow on the line.
 */
function SourceLabel({
  title,
  suffix,
}: {
  title: string;
  suffix: string;
}): ReactElement {
  return (
    <>
      <span dir="auto" className="bidi-text">
        {title}
      </span>
      {suffix === '' ? null : (
        <>
          {' '}
          <span>{suffix}</span>
        </>
      )}
    </>
  );
}

/**
 * UI-38 / UI-50: the SAVE-9 source link — an inline text link in the body font,
 * underlined on hover, flowing in its line rather than centred. A `<button>`
 * always lays out as an inline-block (so a long title would drop below
 * "Saved from" as its own box), hence a focusable span with the button role
 * that opens on click, Enter and Space.
 */
function SourceLink({
  title,
  suffix,
  onOpen,
}: {
  title: string;
  suffix: string;
  onOpen: () => void;
}): ReactElement {
  return (
    <span
      role="button"
      tabIndex={0}
      className="link-button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <SourceLabel title={title} suffix={suffix} />
    </span>
  );
}

/**
 * SAVE-9: the one line under a copy's title — "Saved from …" on a saved copy,
 * "Forked from …" on a fork. A user source links while the caller can still view
 * it (`recipeId` set); a TheMealDB source is plain text ("<meal> on TheMealDB").
 */
function AttributionLine({
  prefix,
  attribution,
  onOpenRecipe,
}: {
  prefix: string;
  attribution: RecipeAttributionDto;
  onOpenRecipe: (id: string) => void;
}): ReactElement {
  const isCatalogue = attribution.source === 'themealdb';
  const suffix = isCatalogue
    ? 'on TheMealDB'
    : attribution.ownerUsername === null
      ? ''
      : `by ${attribution.ownerUsername}`;
  const sourceId = isCatalogue ? null : attribution.recipeId;
  return (
    // UI-19 / SAVE-9: the muted line under the title.
    <p className="byline">
      {prefix}{' '}
      {sourceId === null ? (
        <SourceLabel title={attribution.title} suffix={suffix} />
      ) : (
        <SourceLink
          title={attribution.title}
          suffix={suffix}
          onOpen={() => onOpenRecipe(sourceId)}
        />
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
  const [savingCopy, setSavingCopy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  /** UI-29: a fork's Sync waits for "Replace your version with the original's latest?". */
  const [confirmingSync, setConfirmingSync] = useState(false);
  // UI-25: the editor's note about images that failed to upload after create.
  const [uploadNotice] = useState<{ id: string; text: string } | null>(() => {
    const text = peekUploadNotice(recipeId);
    return text === null ? null : { id: recipeId, text };
  });
  useEffect(() => {
    clearUploadNotice(recipeId);
  }, [recipeId]);

  const shown = versionView?.recipe ?? data;
  const isVersionView = versionView !== null;

  /**
   * SAVE-1 + UI-14 + DISC-10: the button flips to "In your recipes" before the request
   * and back on failure. The screen keeps showing the original; Cook opens the new copy.
   */
  const save = async (): Promise<void> => {
    if (data === null) {
      return;
    }
    setActionError(null);
    setSavingCopy(true);
    try {
      const copy = await api.saveRecipe(data.id);
      setData((current) =>
        current === null
          ? current
          : { ...current, myCopyId: copy.id, updateAvailable: false },
      );
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    } finally {
      setSavingCopy(false);
    }
  };

  /** SAVE-10: the copy takes the source's current version; the API returns the copy. */
  const sync = async (): Promise<void> => {
    if (data === null) {
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      setData(await api.syncRecipe(data.id));
    } catch (cause: unknown) {
      setSyncError(errorMessage(cause));
    } finally {
      setSyncing(false);
      setConfirmingSync(false);
    }
  };

  /** UI-29: a fork asks first (its own edits are replaced); a saved copy syncs at once. */
  const requestSync = (): void => {
    if (data !== null && data.relation === 'own' && data.forkedFrom !== null) {
      setConfirmingSync(true);
      return;
    }
    void sync();
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

  // DISC-10: someone else's recipe the caller already has a live copy of.
  const myCopyId = shown.myCopyId;
  const needsSave =
    myCopyId === null &&
    !savingCopy &&
    !shown.canCook &&
    shown.visibility === 'public' &&
    shown.relation !== 'own';
  // UI-19: "by <owner>" on public recipes the caller does not own; a shared
  // recipe has none, because its tag already names the owner.
  const showOwner =
    shown.relation !== 'own' &&
    shown.relation !== 'saved' &&
    shown.relation !== 'shared';
  // UI-20: a TheMealDB copy with no uploaded image shows its catalogue photo.
  const externalUrl = shown.externalImageUrl;
  const photoUrls =
    shown.imageUrls.length > 0
      ? shown.imageUrls
      : typeof externalUrl === 'string' && externalUrl !== ''
        ? [externalUrl]
        : [];
  const photosAreUploaded = shown.imageUrls.length > 0;
  // SAVE-9: the API sends at most one of the two (saved copy or fork).
  const copySource = shown.savedFrom ?? shown.forkedFrom;
  // SAVE-9/SAVE-10: set only while the caller can still view the source.
  const originalId = copySource?.recipeId ?? null;
  // SAVE-10: the banner is for the caller's own copy, never a version view.
  const showUpdateBanner =
    !isVersionView &&
    shown.updateAvailable &&
    (shown.relation === 'saved' || shown.relation === 'own') &&
    copySource !== null;

  return (
    <main className="screen screen-detail" aria-label="Recipe">
      <Button variant="ghost" className="mb-3" onClick={onBack}>
        <Icon.ArrowLeft size={14} />
        {backLabel}
      </Button>

      <div className="row between align-start gap-4 wrap">
        <div>
          <div className="row wrap mb-2">
            <Tag tone="neutral">{shown.category}</Tag>
            <Tag tone={VISIBILITY_TONE[shown.visibility]}>
              {visibilityLabel(shown)}
            </Tag>
            {/* UI-12: the version tag opens the list of versions (REC-7). */}
            <Button
              variant="ghost"
              className="btn-bare"
              title="Editing creates a new version. Every version of a public recipe stays viewable."
              onClick={() => setVersionsOpen(true)}
            >
              <Tag tone="outline">
                <Icon.History size={11} />
                &nbsp;v{versionView?.versionNumber ?? shown.versionNumber}
              </Tag>
            </Button>
          </div>
          {/* UI-41/UI-50: user-written text carries dir="auto" and stays left-aligned. */}
          <h1 dir="auto" className="page-title bidi-text">
            {shown.title}
          </h1>
          {showOwner ? (
            <p className="byline mb-2">by {shown.ownerUsername}</p>
          ) : null}
          {shown.description === undefined ||
          shown.description === '' ? null : (
            <p
              dir="auto"
              className="text-muted text-lead bidi-text"
              style={{ maxWidth: '520px' }}
            >
              {shown.description}
            </p>
          )}
          {shown.savedFrom !== null ? (
            <AttributionLine
              prefix="Saved from"
              attribution={shown.savedFrom}
              onOpenRecipe={onOpenRecipe}
            />
          ) : shown.forkedFrom !== null ? (
            <AttributionLine
              prefix="Forked from"
              attribution={shown.forkedFrom}
              onOpenRecipe={onOpenRecipe}
            />
          ) : null}
        </div>

        {isVersionView ? null : (
          <div className="stack align-end gap-2">
            {myCopyId !== null || savingCopy ? (
              // DISC-10 / UI-14: already in the caller's recipes; cook the copy.
              <>
                <Tag tone="neutral">In your recipes</Tag>
                <Button
                  variant="primary"
                  className="btn-lg"
                  disabled={myCopyId === null}
                  onClick={() => {
                    if (myCopyId !== null) {
                      onCook(myCopyId);
                    }
                  }}
                >
                  <Icon.Play size={17} />
                  Start cooking
                </Button>
              </>
            ) : shown.canCook ? (
              <Button
                variant="primary"
                className="btn-lg"
                onClick={() => onCook(shown.id)}
              >
                <Icon.Play size={17} />
                Start cooking
              </Button>
            ) : null}
            {needsSave ? (
              <Button
                variant="primary"
                className="btn-lg"
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

      {uploadNotice === null || uploadNotice.id !== shown.id ? null : (
        <div className="mt-3">
          <InlineError>{uploadNotice.text}</InlineError>
        </div>
      )}

      {/* SAVE-10: the source moved on; Sync appends its current content as a new version. */}
      {showUpdateBanner ? (
        <div role="status" className="update-banner">
          {/* UI-47: a fork says "forked"; a saved copy keeps "saved". */}
          <span className="text-body grow">
            The original has changed since you{' '}
            {shown.forkedFrom !== null ? 'forked' : 'saved'} it
          </span>
          {originalId === null ? null : (
            <Button variant="ghost" onClick={() => onOpenRecipe(originalId)}>
              View the original
            </Button>
          )}
          <Button
            variant="secondary"
            loading={syncing}
            onClick={requestSync}
          >
            <Icon.Download size={14} />
            Sync
          </Button>
          {syncError === null ? null : (
            <div style={{ flexBasis: '100%' }}>
              <InlineError>{syncError}</InlineError>
            </div>
          )}
        </div>
      ) : null}

      {versionView === null ? null : (
        <div className="row gap-3 mt-3">
          <span className="text-muted text-small">
            Viewing version {versionView.versionNumber}, read-only.
          </span>
          <Button variant="secondary" onClick={() => setVersionView(null)}>
            Back to current
          </Button>
        </div>
      )}

      {/* UI-12: the owner row, and Remove from my recipes on a saved copy (SAVE-4). */}
      {!isVersionView && (shown.canEdit || shown.relation === 'saved') ? (
        <div className="mt-3">
          <OwnerActions
            recipe={shown}
            onEdit={onEdit}
            onChanged={(updated) => setData(updated)}
            onDeleted={onDeleted}
          />
        </div>
      ) : null}

      {/* IMG-4: signed URLs expire; a failed image refetches the recipe. UI-20:
          the external catalogue photo is not signed, so its failure refetches nothing. */}
      {photoUrls.length === 0 ? null : (
        <div className="photo-row">
          {photoUrls.map((url, index) => (
            <div key={url} className="grow shrink">
              <WashedImage
                src={url}
                alt={`${shown.title}, image ${index + 1}`}
                seed={shown.id}
                height={180}
                onError={photosAreUploaded ? reload : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* The guide's 44px column gap, built from the 4.4px spacing step. */}
      <div className="split-columns split-columns-wide mt-8">
        <section aria-label="Ingredients">
          <IngredientsPanel
            ingredients={shown.ingredients}
            servings={shown.servings}
          />
          {isVersionView ? null : <NutritionPatch recipeId={shown.id} />}
        </section>

        <section aria-label="Steps">
          <h4 className="mb-3">Steps</h4>
          <ol className="list-reset stack gap-3">
            {shown.steps.map((step, index) => (
              <li key={`${index}-${step.text}`} className="row align-start gap-3">
                <span className="step-number">{index + 1}</span>
                <div className="step-text">
                  {/* UI-50: only the step's own text is directional; the minutes
                      tag sits outside it, so it always follows on the left-to-right line. */}
                  {/* UI-45: the step keeps its line breaks. */}
                  <span dir="auto" className="bidi-text text-pre-line">
                    {step.text}
                  </span>
                  {/* UI-15: the minutes tag shows on the detail screen too. */}
                  {step.durationMinutes === undefined ? null : (
                    <Tag tone="accent-2" className="step-minutes">
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
              <div className="hr hr-section" />
              {/* UI-47: no footnote under or next to the rating input; the filled
                  stars already show the caller's rating. */}
              <div className="row gap-3 mb-6">
                <h4 className="m-0">Your rating</h4>
                <StarInput
                  value={shown.rating?.mine ?? null}
                  onRate={(stars) => void rate(stars)}
                />
              </div>
            </>
          ) : null}

          {/* COM-1: private recipes have no comment section (UI-15). UI-24: without
              the rating block (shared recipes) the same divider opens the comments. */}
          {!isVersionView && shown.hasComments ? (
            <>
              {shown.canRate ? null : (
                <div className="hr hr-section" />
              )}
              <CommentsSection recipeId={shown.id} hasVotes={shown.hasVotes} />
            </>
          ) : null}
        </section>
      </div>

      {shown.attribution === null ? null : (
        <p className="text-muted text-caption mt-8">{shown.attribution}</p>
      )}

      {confirmingSync ? (
        <ConfirmDialog
          title="Replace your version with the original's latest?"
          confirmLabel="Sync"
          loading={syncing}
          onConfirm={() => void sync()}
          onCancel={() => setConfirmingSync(false)}
        >
          Your changes stay in the version history.
        </ConfirmDialog>
      ) : null}

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

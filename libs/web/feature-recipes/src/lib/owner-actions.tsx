// SPEC.md REC-6, REC-2/REC-3, SAVE-4, SAVE-7/SAVE-8, UI-12 and UI-28: the owner row on
// the recipe detail screen — Edit, Visibility, Share…, Delete; a saved copy gets
// only Edit and Remove from my recipes, since it stays private until its first
// edit makes it a fork. Every mutation adopts the DTO the API returned (§11.6).
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import type { Visibility } from '@rsn/shared/util-domain';
import { VISIBILITIES, isVisibility } from '@rsn/shared/util-domain';
import { ApiError, useApi } from '@rsn/web/data-access-api';
import { Button, ConfirmDialog, Icon, InlineError, Select } from '@rsn/web/ui';
import { ShareDialog } from './share-dialog';

export interface OwnerActionsProps {
  recipe: RecipeDetailDto;
  onEdit: (id: string) => void;
  /** Adopts the recipe the API returned after a visibility or sharing change. */
  onChanged: (recipe: RecipeDetailDto) => void;
  /** REC-6 / SAVE-4: the recipe is gone; the shell leaves the screen. */
  onDeleted: () => void;
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Private',
  shared: 'Shared with friends',
  public: 'Public',
};

const VISIBILITY_OPTIONS = VISIBILITIES.map((visibility) => ({
  value: visibility,
  label: VISIBILITY_LABELS[visibility],
}));

/** UI-12: the "Owner" row. Saved copies get the softer "Remove" wording (SAVE-4). */
export function OwnerActions({
  recipe,
  onEdit,
  onChanged,
  onDeleted,
}: OwnerActionsProps): ReactElement {
  const api = useApi();
  const [sharing, setSharing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** UI-28: "Public" waits for "Publish to everyone?". */
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSavedCopy = recipe.relation === 'saved';

  const message = (cause: unknown): string =>
    cause instanceof ApiError || cause instanceof Error
      ? cause.message
      : 'Something went wrong.';

  /** Writes a visibility that needs no friend list (Private, Public). */
  const writeVisibility = async (value: Visibility): Promise<void> => {
    setError(null);
    setVisibilityBusy(true);
    try {
      onChanged(await api.setVisibility(recipe.id, { visibility: value }));
      setPublishing(false);
    } catch (cause: unknown) {
      setPublishing(false);
      setError(message(cause));
    } finally {
      setVisibilityBusy(false);
    }
  };

  /**
   * UI-28: Shared opens the Share dialog without writing (its Save sends
   * `shared` with the ticked friends, REC-2); Public asks first; Private writes
   * at once. The select stays controlled by the recipe, so a Cancel leaves it as it was.
   */
  const changeVisibility = (value: string): void => {
    if (!isVisibility(value) || value === recipe.visibility) {
      return;
    }
    setError(null);
    if (value === 'shared') {
      setSharing(true);
    } else if (value === 'public') {
      setPublishing(true);
    } else {
      void writeVisibility(value);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteRecipe(recipe.id);
      setConfirming(false);
      onDeleted();
    } catch (cause: unknown) {
      setError(message(cause));
      setBusy(false);
    }
  };

  return (
    <div className="row wrap">
      <span className="text-muted text-small owner-label">Owner</span>

      {recipe.canEdit ? (
        <Button variant="secondary" onClick={() => onEdit(recipe.id)}>
          <Icon.Pencil size={14} />
          Edit
        </Button>
      ) : null}

      {/* SAVE-8: a saved copy cannot be shared or published, so no Visibility or Share…. */}
      {recipe.canEdit && !isSavedCopy ? (
        <Select
          aria-label="Visibility"
          value={recipe.visibility}
          options={VISIBILITY_OPTIONS}
          className="input-auto"
          disabled={visibilityBusy}
          onChange={(event) => changeVisibility(event.target.value)}
        />
      ) : null}

      {recipe.canEdit && !isSavedCopy && recipe.visibility === 'shared' ? (
        <Button variant="secondary" onClick={() => setSharing(true)}>
          <Icon.Share2 size={14} />
          Share…
        </Button>
      ) : null}

      <Button variant="ghost" onClick={() => setConfirming(true)}>
        <Icon.Trash2 size={14} />
        {isSavedCopy ? 'Remove from my recipes' : 'Delete'}
      </Button>

      {error === null ? null : <InlineError>{error}</InlineError>}

      {sharing ? (
        <ShareDialog
          recipeId={recipe.id}
          selectedUserIds={recipe.sharedWithUserIds}
          onSaved={onChanged}
          onClose={() => setSharing(false)}
        />
      ) : null}

      {publishing ? (
        <ConfirmDialog
          title="Publish to everyone?"
          confirmLabel="Publish"
          loading={visibilityBusy}
          onConfirm={() => void writeVisibility('public')}
          onCancel={() => setPublishing(false)}
        >
          Every version of this recipe becomes visible to all users.
        </ConfirmDialog>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={
            isSavedCopy ? 'Remove from my recipes?' : 'Delete this recipe?'
          }
          confirmLabel={isSavedCopy ? 'Remove' : 'Delete'}
          loading={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        >
          {isSavedCopy
            ? 'Your copy is removed. The original stays where you saved it from.'
            : 'The recipe and every version of it are removed. This cannot be undone.'}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

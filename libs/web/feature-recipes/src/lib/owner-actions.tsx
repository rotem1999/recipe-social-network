// SPEC.md REC-6, REC-2/REC-3, SAVE-4 and UI-12: the owner row on the recipe
// detail screen — Edit, Visibility, Share…, Delete, and Remove from my recipes
// on a saved copy. Every mutation adopts the DTO the API returned (§11.6).
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSavedCopy = recipe.relation === 'saved';

  const message = (cause: unknown): string =>
    cause instanceof ApiError || cause instanceof Error
      ? cause.message
      : 'Something went wrong.';

  const changeVisibility = async (value: string): Promise<void> => {
    if (!isVisibility(value) || value === recipe.visibility) {
      return;
    }
    setError(null);
    try {
      onChanged(await api.setVisibility(recipe.id, { visibility: value }));
      // REC-2: "shared" means nothing until friends are picked, so ask right away.
      if (value === 'shared') {
        setSharing(true);
      }
    } catch (cause: unknown) {
      setError(message(cause));
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
      }}
    >
      <span
        className="text-muted"
        style={{ fontSize: '12px', marginRight: 'var(--space-1)' }}
      >
        Owner
      </span>

      {recipe.canEdit ? (
        <Button variant="secondary" onClick={() => onEdit(recipe.id)}>
          <Icon.Pencil size={14} />
          Edit
        </Button>
      ) : null}

      {recipe.canEdit ? (
        <Select
          aria-label="Visibility"
          value={recipe.visibility}
          options={VISIBILITY_OPTIONS}
          style={{ width: 'auto' }}
          onChange={(event) => void changeVisibility(event.target.value)}
        />
      ) : null}

      {recipe.canEdit && recipe.visibility === 'shared' ? (
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

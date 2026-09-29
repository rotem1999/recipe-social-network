// SPEC.md REC-2/REC-8 and UI-12: the "Share…" dialog — the owner ticks the
// friends a shared recipe is visible to. The list comes from `GET /friends`.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import { Button, Dialog, EmptyState, InlineError } from '@rsn/web/ui';

export interface ShareDialogProps {
  recipeId: string;
  /** The user ids the recipe is already shared with (`sharedWithUserIds`). */
  selectedUserIds: readonly string[];
  onSaved: (recipe: RecipeDetailDto) => void;
  onClose: () => void;
}

/** REC-2: sharing with friends, without publishing to the network. */
export function ShareDialog({
  recipeId,
  selectedUserIds,
  onSaved,
  onClose,
}: ShareDialogProps): ReactElement {
  const api = useApi();
  const { data, error } = useRequest(() => api.getFriends(), []);
  const [selected, setSelected] = useState<string[]>([...selectedUserIds]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggle = (userId: string): void =>
    setSelected((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );

  const save = async (): Promise<void> => {
    setBusy(true);
    setSaveError(null);
    try {
      onSaved(
        await api.setVisibility(recipeId, {
          visibility: 'shared',
          sharedWithUserIds: selected,
        }),
      );
      onClose();
    } catch (cause: unknown) {
      setSaveError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : 'Could not update sharing.',
      );
      setBusy(false);
    }
  };

  const friends = data?.friends ?? [];

  return (
    <Dialog
      title="Share with friends"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      {error === null ? null : <InlineError>{error.message}</InlineError>}
      {error === null && friends.length === 0 ? (
        <EmptyState text="No friends yet — add some on the Friends tab." />
      ) : null}
      <div className="stack gap-2">
        {friends.map((friend) => (
          <label key={friend.userId} className="row text-body">
            <input
              type="checkbox"
              checked={selected.includes(friend.userId)}
              onChange={() => toggle(friend.userId)}
            />
            {friend.username}
          </label>
        ))}
      </div>
      {saveError === null ? null : <InlineError>{saveError}</InlineError>}
    </Dialog>
  );
}

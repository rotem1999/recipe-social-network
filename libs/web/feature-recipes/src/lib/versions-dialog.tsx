// SPEC.md REC-7 and UI-12: the version list behind the "vN" tag. Picking a
// version opens it read-only; there is no restore.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { ApiError, useApi, useRequest } from '@rsn/web/data-access-api';
import { Button, Dialog, InlineError, Tag } from '@rsn/web/ui';

export interface VersionsDialogProps {
  recipeId: string;
  /** Called with the version the owner picked, read-only (REC-7). */
  onPick: (version: RecipeDetailDto, versionNumber: number) => void;
  onClose: () => void;
}

/** A version's creation time in the viewer's own locale. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** REC-7: every version stays viewable; visibility applies to the whole history. */
export function VersionsDialog({
  recipeId,
  onPick,
  onClose,
}: VersionsDialogProps): ReactElement {
  const api = useApi();
  const { data, error, loading } = useRequest(
    () => api.listVersions(recipeId),
    [recipeId],
  );
  const [pickError, setPickError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const pick = async (versionNumber: number): Promise<void> => {
    setPending(versionNumber);
    setPickError(null);
    try {
      onPick(await api.getVersion(recipeId, versionNumber), versionNumber);
      onClose();
    } catch (cause: unknown) {
      setPickError(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : 'Could not open that version.',
      );
      setPending(null);
    }
  };

  const versions = data?.versions ?? [];

  return (
    <Dialog
      title="Versions"
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {error === null ? null : <InlineError>{error.message}</InlineError>}
      {loading ? (
        <p className="text-muted text-compact">Loading…</p>
      ) : null}
      <div className="stack gap-1">
        {versions.map((version) => (
          <div key={version.versionNumber} className="version-row">
            <span className="version-number">v{version.versionNumber}</span>
            <span className="grow">
              {/* UI-41: the title is user text. */}
              <span dir="auto" className="text-body">
                {version.title}
              </span>
              <span className="text-muted text-small version-date">
                {formatDate(version.createdAt)}
              </span>
            </span>
            {version.isCurrent ? <Tag tone="accent-2">Current</Tag> : null}
            <Button
              variant="secondary"
              loading={pending === version.versionNumber}
              className="btn-sm"
              onClick={() => void pick(version.versionNumber)}
            >
              View
            </Button>
          </div>
        ))}
      </div>
      {pickError === null ? null : <InlineError>{pickError}</InlineError>}
    </Dialog>
  );
}

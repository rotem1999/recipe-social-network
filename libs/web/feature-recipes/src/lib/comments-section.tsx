// SPEC.md COM-1..3, UI-15, UI-32, UI-46 and UI-50, design guide §5: the comment
// list. Votes render on public recipes only (COM-2); the author can delete their
// own comment (COM-3) after a confirmation.
import { useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { CommentDto } from '@rsn/shared/util-contracts';
import {
  COMMENT_MAX_LENGTH,
  formatDate,
  formatDateTime,
} from '@rsn/shared/util-domain';
import {
  ApiError,
  useApi,
  useAuth,
  useRequest,
} from '@rsn/web/data-access-api';
import {
  Button,
  ConfirmDialog,
  Icon,
  InlineError,
  Input,
  VoteControl,
} from '@rsn/web/ui';
import type { VoteValue } from '@rsn/web/ui';

export interface CommentsSectionProps {
  recipeId: string;
  /** COM-2: up/down votes exist on public recipes only. */
  hasVotes: boolean;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** UI-32: ages up to a week read "3 d ago"; older comments show their date. */
const WEEK_MS = 7 * DAY_MS;

/** UI-32: "just now", "5 min ago", "2 h ago", "3 d ago", then the date. */
function ageLabel(createdAt: string, now: number): string {
  const created = new Date(createdAt);
  const elapsed = now - created.getTime();
  if (Number.isNaN(elapsed)) {
    return '';
  }
  if (elapsed < MINUTE_MS) {
    return 'just now';
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)} h ago`;
  }
  if (elapsed < WEEK_MS) {
    return `${Math.floor(elapsed / DAY_MS)} d ago`;
  }
  // UI-46: the app's one date format, "3 Sep 2026", whatever the OS locale.
  return formatDate(created);
}

/** COM-1: the comment section of a public or shared recipe. */
export function CommentsSection({
  recipeId,
  hasVotes,
}: CommentsSectionProps): ReactElement {
  const api = useApi();
  const { user } = useAuth();
  const { data, error, setData, reload } = useRequest(
    () => api.listComments(recipeId),
    [recipeId],
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** UI-32: the comment waiting for "Delete this comment?". */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const comments = data?.comments ?? [];

  /** Puts the DTO the API returned back into the local list (COM-3). */
  const replace = (comment: CommentDto): void =>
    setData((previous) =>
      previous === null
        ? previous
        : {
            ...previous,
            comments: previous.comments.map((item) =>
              item.id === comment.id ? comment : item,
            ),
          },
    );

  const message = (cause: unknown): string =>
    cause instanceof ApiError || cause instanceof Error
      ? cause.message
      : 'Something went wrong.';

  const post = async (): Promise<void> => {
    const body = draft.trim();
    if (body.length === 0) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.postComment(recipeId, { body });
      setDraft('');
      // UI-32: the new comment takes the place the server's order gives it (COM-3).
      reload();
    } catch (cause: unknown) {
      setActionError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  const vote = async (commentId: string, value: VoteValue): Promise<void> => {
    setActionError(null);
    try {
      replace(await api.vote(commentId, value));
    } catch (cause: unknown) {
      setActionError(message(cause));
    }
  };

  const remove = async (commentId: string): Promise<void> => {
    setActionError(null);
    setDeleting(true);
    try {
      await api.deleteComment(commentId);
      setDeletingId(null);
      setData((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              comments: previous.comments.filter(
                (item) => item.id !== commentId,
              ),
            },
      );
    } catch (cause: unknown) {
      setDeletingId(null);
      setActionError(message(cause));
    } finally {
      setDeleting(false);
    }
  };

  /** UI-32: Enter in the comment input posts it. */
  const onDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && !busy) {
      event.preventDefault();
      void post();
    }
  };

  const now = Date.now();

  return (
    <section aria-label="Comments">
      <h4 className="mb-3">
        {comments.length === 1 ? '1 comment' : `${comments.length} comments`}
      </h4>

      {error === null ? null : <InlineError>{error.message}</InlineError>}

      <div className="stack gap-3 mb-4">
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            {hasVotes ? (
              <VoteControl
                points={comment.points}
                myVote={comment.myVote}
                onVote={(value) => void vote(comment.id, value)}
              />
            ) : null}
            <div className="grow">
              <div className="comment-author">
                {comment.authorUsername}
                {/* UI-32: the comment's age next to its author. */}
                <time
                  className="text-muted comment-age"
                  dateTime={comment.createdAt}
                  // UI-46: the hover text is "29 Sep 2026, 01:07".
                  title={formatDateTime(comment.createdAt)}
                >
                  {ageLabel(comment.createdAt, now)}
                </time>
                {user !== null && user.id === comment.authorId ? (
                  <Button
                    variant="ghost"
                    aria-label="Delete comment"
                    className="btn-xs"
                    onClick={() => setDeletingId(comment.id)}
                  >
                    <Icon.Trash2 size={12} />
                    Delete
                  </Button>
                ) : null}
              </div>
              {/* UI-41/UI-50: comments are user text, so they carry dir="auto";
                  the row stays left-aligned. */}
              <div dir="auto" className="text-body bidi-text">
                {comment.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="comment-form">
        <Input
          placeholder="Add a comment"
          aria-label="Add a comment"
          dir="auto"
          maxLength={COMMENT_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onDraftKeyDown}
        />
        <Button
          variant="secondary"
          className="no-flex"
          loading={busy}
          disabled={draft.trim().length === 0}
          onClick={() => void post()}
        >
          Post
        </Button>
      </div>

      {actionError === null ? null : <InlineError>{actionError}</InlineError>}

      {deletingId === null ? null : (
        <ConfirmDialog
          title="Delete this comment?"
          confirmLabel="Delete"
          loading={deleting}
          onConfirm={() => void remove(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </section>
  );
}

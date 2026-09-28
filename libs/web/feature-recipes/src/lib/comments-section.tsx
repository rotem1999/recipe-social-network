// SPEC.md COM-1..3 and UI-15, design guide §5: the comment list. Votes render on
// public recipes only (COM-2); the author can delete their own comment (COM-3).
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { CommentDto } from '@rsn/shared/util-contracts';
import { COMMENT_MAX_LENGTH } from '@rsn/shared/util-domain';
import {
  ApiError,
  useApi,
  useAuth,
  useRequest,
} from '@rsn/web/data-access-api';
import { Button, Icon, InlineError, Input, VoteControl } from '@rsn/web/ui';
import type { VoteValue } from '@rsn/web/ui';

export interface CommentsSectionProps {
  recipeId: string;
  /** COM-2: up/down votes exist on public recipes only. */
  hasVotes: boolean;
}

/** COM-1: the comment section of a public or shared recipe. */
export function CommentsSection({
  recipeId,
  hasVotes,
}: CommentsSectionProps): ReactElement {
  const api = useApi();
  const { user } = useAuth();
  const { data, error, setData } = useRequest(
    () => api.listComments(recipeId),
    [recipeId],
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      const created = await api.postComment(recipeId, { body });
      setData((previous) =>
        previous === null
          ? { comments: [created], votesEnabled: hasVotes }
          : { ...previous, comments: [...previous.comments, created] },
      );
      setDraft('');
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
    try {
      await api.deleteComment(commentId);
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
      setActionError(message(cause));
    }
  };

  return (
    <section aria-label="Comments">
      <h4 style={{ marginBottom: 'var(--space-3)' }}>
        {comments.length === 1 ? '1 comment' : `${comments.length} comments`}
      </h4>

      {error === null ? null : <InlineError>{error.message}</InlineError>}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {comments.map((comment) => (
          <div
            key={comment.id}
            style={{ display: 'flex', gap: 'var(--space-3)' }}
          >
            {hasVotes ? (
              <VoteControl
                points={comment.points}
                myVote={comment.myVote}
                onVote={(value) => void vote(comment.id, value)}
              />
            ) : null}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                {comment.authorUsername}
                {user !== null && user.id === comment.authorId ? (
                  <Button
                    variant="ghost"
                    aria-label="Delete comment"
                    style={{ fontSize: '11px', paddingBlock: '2px' }}
                    onClick={() => void remove(comment.id)}
                  >
                    <Icon.Trash2 size={12} />
                    Delete
                  </Button>
                ) : null}
              </div>
              <div style={{ fontSize: '14px' }}>{comment.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Input
          placeholder="Add a comment"
          aria-label="Add a comment"
          maxLength={COMMENT_MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          variant="secondary"
          style={{ flex: 'none' }}
          loading={busy}
          disabled={draft.trim().length === 0}
          onClick={() => void post()}
        >
          Post
        </Button>
      </div>

      {actionError === null ? null : <InlineError>{actionError}</InlineError>}
    </section>
  );
}

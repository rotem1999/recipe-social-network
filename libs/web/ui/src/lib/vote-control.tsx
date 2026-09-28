import type { ReactElement } from 'react';
import { cx } from './class-names';

/** COM-2: the viewer's own vote on a comment — up, down, or none. */
export type VoteValue = 1 | 0 | -1;

export interface VoteControlProps {
  points: number;
  myVote: VoteValue;
  /** Called with the new value; clicking the arrow that is already active clears the vote. */
  onVote: (vote: VoteValue) => void;
  disabled?: boolean;
  className?: string;
}

/** COM-2: the ▲ points ▼ column beside a comment on a public recipe. */
export function VoteControl({
  points,
  myVote,
  onVote,
  disabled = false,
  className,
}: VoteControlProps): ReactElement {
  const pointsClass =
    myVote === 1 ? 'is-up' : myVote === -1 ? 'is-down' : undefined;

  return (
    <span className={cx('vote', className)}>
      <button
        type="button"
        className={cx('vote-up', myVote === 1 && 'is-on')}
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        disabled={disabled}
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
      >
        ▲
      </button>
      <span className={cx('vote-points', pointsClass)}>{points}</span>
      <button
        type="button"
        className={cx('vote-down', myVote === -1 && 'is-on')}
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        disabled={disabled}
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
      >
        ▼
      </button>
    </span>
  );
}

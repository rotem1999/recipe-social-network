import { useState } from 'react';
import type { ReactElement } from 'react';
import { MAX_STARS, MIN_STARS } from '@rsn/shared/util-domain';
import { cx } from './class-names';

export interface StarInputProps {
  /** The viewer's own grade, or null when they have not rated yet. */
  value: number | null;
  onRate: (stars: number) => void;
  disabled?: boolean;
  className?: string;
}

const STARS: readonly number[] = Array.from(
  { length: MAX_STARS - MIN_STARS + 1 },
  (_, i) => MIN_STARS + i,
);

/** RATE-1: whole stars only, 1 to 5. Hover previews the grade and scales the star. */
export function StarInput({
  value,
  onRate,
  disabled = false,
  className,
}: StarInputProps): ReactElement {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <span
      className={cx('star-input', className)}
      role="radiogroup"
      aria-label="Your rating"
      onMouseLeave={() => setHovered(null)}
    >
      {STARS.map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={stars === 1 ? '1 star' : `${stars} stars`}
          disabled={disabled}
          className={stars <= shown ? 'is-on' : undefined}
          onMouseEnter={() => setHovered(disabled ? null : stars)}
          onFocus={() => setHovered(disabled ? null : stars)}
          onBlur={() => setHovered(null)}
          onClick={() => onRate(stars)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

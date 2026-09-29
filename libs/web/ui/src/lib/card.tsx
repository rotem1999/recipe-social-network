import type { HTMLAttributes, ReactElement } from 'react';
import { cx } from './class-names';

export type CardElevation = 'sm' | 'md' | 'lg' | 'none';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
  /** Whole-card hover (shadow-md + 2px lift); use when the card itself is the link. */
  interactive?: boolean;
  /** Removes the padding and the gap so a `.washed` image can sit flush at the top. */
  flush?: boolean;
}

const ELEVATION_CLASS: Record<CardElevation, string> = {
  sm: 'elev-sm',
  md: 'elev-md',
  lg: 'elev-lg',
  none: '',
};

/** UI-3: the guide's `.card` — the recipe card on Home and Discover. */
export function Card({
  elevation = 'sm',
  interactive = false,
  flush = false,
  className,
  children,
  ...rest
}: CardProps): ReactElement {
  return (
    <div
      {...rest}
      className={cx(
        'card',
        ELEVATION_CLASS[elevation],
        interactive && 'card-interactive',
        flush && 'card-flush',
        className,
      )}
    >
      {children}
    </div>
  );
}

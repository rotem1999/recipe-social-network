import type { ReactElement } from 'react';
import { cx } from './class-names';

export interface ProgressBarProps {
  /** How far along, 0 to `max`. */
  value: number;
  max?: number;
  label?: string;
  className?: string;
}

/** UI-15: the 5px bar under the cook-mode header; the accent fill animates to width. */
export function ProgressBar({
  value,
  max = 1,
  label = 'Progress',
  className,
}: ProgressBarProps): ReactElement {
  const safeMax = max <= 0 ? 1 : max;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;

  return (
    <div
      className={cx('progress', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={clamped}
    >
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

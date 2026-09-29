import type { ReactElement } from 'react';
import { cx } from './class-names';

export interface ProgressDotsProps {
  count: number;
  /** Zero-based index of the step being shown. */
  current: number;
  onSelect: (index: number) => void;
  className?: string;
}

/** UI-15: the clickable step dots at the foot of cook mode — done, current, upcoming. */
export function ProgressDots({
  count,
  current,
  onSelect,
  className,
}: ProgressDotsProps): ReactElement {
  return (
    <span className={cx('progress-dots', className)}>
      {Array.from({ length: Math.max(count, 0) }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Step ${index + 1} of ${count}`}
          aria-current={index === current ? 'step' : undefined}
          className={cx(
            index < current && 'is-done',
            index === current && 'is-current',
          )}
          onClick={() => onSelect(index)}
        />
      ))}
    </span>
  );
}

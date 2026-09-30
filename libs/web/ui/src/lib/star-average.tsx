import type { ReactElement } from 'react';
import {
  MAX_STARS,
  roundToQuarter,
  toTwoDecimals,
} from '@rsn/shared/util-domain';
import { cx } from './class-names';

export interface StarAverageProps {
  /** The stored average (RATE-2, two decimals); null when nothing is rated yet. */
  average: number | null;
  count: number;
  /** Star size in px; the guide uses 13 on cards and 17 on the detail screen. */
  size?: number;
  className?: string;
}

const ROW = '★★★★★';

/**
 * RATE-3: two overlaid ★★★★★ rows — the coloured one is clipped to the average
 * rounded to the nearest quarter star. The decimal is on the row's `title` and
 * appears as a small caption on hover or keyboard focus.
 */
export function StarAverage({
  average,
  count,
  size = 13,
  className,
}: StarAverageProps): ReactElement {
  const hasRatings = average !== null && count > 0;
  const percent = hasRatings ? (roundToQuarter(average) / MAX_STARS) * 100 : 0;
  const decimal = hasRatings ? toTwoDecimals(average).toFixed(2) : null;
  const countLabel = count === 1 ? '1 rating' : `${count} ratings`;

  return (
    <span
      className={cx('stars-row', className)}
      tabIndex={0}
      title={
        decimal === null ? 'No ratings yet' : `${decimal} out of ${MAX_STARS}`
      }
      aria-label={
        decimal === null
          ? 'No ratings yet'
          : `${decimal} out of ${MAX_STARS}, ${countLabel}`
      }
    >
      <span
        className="stars"
        style={{ fontSize: `${size}px` }}
        aria-hidden="true"
      >
        <span className="stars-empty">{ROW}</span>
        <span className="stars-full" style={{ width: `${percent}%` }}>
          {ROW}
        </span>
      </span>
      {decimal === null ? null : (
        <span className="stars-decimal" aria-hidden="true">
          {decimal}
        </span>
      )}
      <span className="text-muted text-small" aria-hidden="true">
        {hasRatings ? countLabel : 'No ratings yet'}
      </span>
    </span>
  );
}

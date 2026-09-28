import type { HTMLAttributes, ReactElement } from 'react';
import { cx } from './class-names';

export type KickerTone = 'accent' | 'accent-2' | 'muted';

export interface KickerProps extends HTMLAttributes<HTMLDivElement> {
  tone?: KickerTone;
}

const TONE_CLASS: Record<KickerTone, string> = {
  accent: '',
  'accent-2': 'kicker-accent-2',
  muted: 'kicker-muted',
};

/** UI-6: the 11px caps label above a recommendation, a cook step or an AI tip. */
export function Kicker({
  tone = 'accent',
  className,
  children,
  ...rest
}: KickerProps): ReactElement {
  return (
    <div {...rest} className={cx('kicker', TONE_CLASS[tone], className)}>
      {children}
    </div>
  );
}

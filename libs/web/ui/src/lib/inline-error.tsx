import type { ReactElement, ReactNode } from 'react';
import { cx } from './class-names';

export interface InlineErrorProps {
  className?: string;
  children: ReactNode;
}

/**
 * UI-9: inline error text under a form or an action. Body-size accent text uses
 * `--color-accent-700` for contrast (the guide's colour rule).
 */
export function InlineError({
  className,
  children,
}: InlineErrorProps): ReactElement {
  return (
    <p
      role="alert"
      className={cx('inline-error', className)}
      style={{ margin: 'var(--space-1) 0 0' }}
    >
      {children}
    </p>
  );
}

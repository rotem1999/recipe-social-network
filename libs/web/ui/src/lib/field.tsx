import type { ReactElement, ReactNode } from 'react';
import { cx } from './class-names';
import { InlineError } from './inline-error';

export interface FieldProps {
  label: ReactNode;
  /** The id of the control inside, so the label points at it. */
  htmlFor?: string;
  hint?: ReactNode;
  /** Inline validation message, shown under the control (UI-9). */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** UI-3: the guide's `.field` — a 12px label above its control. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: FieldProps): ReactElement {
  return (
    <div className={cx('field', className)}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint === undefined || hint === null ? null : (
        <p
          className="text-muted"
          style={{ fontSize: '12px', margin: 'var(--space-1) 0 0' }}
        >
          {hint}
        </p>
      )}
      {error === undefined || error === null ? null : (
        <InlineError>{error}</InlineError>
      )}
    </div>
  );
}

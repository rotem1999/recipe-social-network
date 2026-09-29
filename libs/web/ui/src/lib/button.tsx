import type { ButtonHTMLAttributes, ReactElement } from 'react';
import { cx } from './class-names';
import { Icon } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type'
> {
  variant?: ButtonVariant;
  /** Shows the spinner and blocks the button while an action is in flight. */
  loading?: boolean;
  block?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  // An icon button is a secondary button squared off to 36×36 (the guide's .btn-icon).
  icon: 'btn-secondary btn-icon',
};

/** UI-3/UI-6: the guide's `.btn` in each of its variants. */
export function Button({
  variant = 'secondary',
  loading = false,
  block = false,
  type = 'button',
  className,
  disabled,
  children,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={cx(
        'btn',
        VARIANT_CLASS[variant],
        block && 'btn-block',
        className,
      )}
    >
      {loading ? <Icon.Loader2 size={15} className="spin" /> : null}
      {children}
    </button>
  );
}

import type { ReactElement, SelectHTMLAttributes } from 'react';
import { cx } from './class-names';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Convenience for the common case; `children` is used when it is omitted. */
  options?: readonly SelectOption[];
}

/** UI-3: a native select wearing the guide's `.input` skin. */
export function Select({
  className,
  options,
  children,
  ...rest
}: SelectProps): ReactElement {
  return (
    <select {...rest} className={cx('input', 'select-input', className)}>
      {options === undefined
        ? children
        : options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
    </select>
  );
}

import type { InputHTMLAttributes, ReactElement, Ref } from 'react';
import { cx } from './class-names';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputRef?: Ref<HTMLInputElement>;
}

/** UI-3: the guide's pill `.input`. */
export function Input({
  className,
  inputRef,
  type = 'text',
  ...rest
}: InputProps): ReactElement {
  return (
    <input
      {...rest}
      ref={inputRef}
      type={type}
      className={cx('input', className)}
    />
  );
}

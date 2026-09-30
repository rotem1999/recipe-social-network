import type { ReactElement, TextareaHTMLAttributes } from 'react';
import { cx } from './class-names';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * UI-3: the guide's `textarea.input` (min-height 90px, vertical resize); UI-37
 * gives it `--radius-lg` instead of the pill radius (tokens.css).
 */
export function Textarea({ className, ...rest }: TextareaProps): ReactElement {
  return <textarea {...rest} className={cx('input', className)} />;
}

import type { HTMLAttributes, ReactElement } from 'react';
import { cx } from './class-names';

export type TagTone = 'accent' | 'accent-2' | 'neutral' | 'outline';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
}

const TONE_CLASS: Record<TagTone, string> = {
  accent: 'tag-accent',
  'accent-2': 'tag-accent-2',
  neutral: 'tag-neutral',
  outline: 'tag-outline',
};

/** UI-3: the guide's `.tag` — category, visibility and version labels. */
export function Tag({
  tone = 'neutral',
  className,
  children,
  ...rest
}: TagProps): ReactElement {
  return (
    <span {...rest} className={cx('tag', TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

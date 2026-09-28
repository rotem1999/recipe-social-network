import type { ReactElement, ReactNode } from 'react';
import { cx } from './class-names';
import { Icon } from './icon';

export interface EmptyStateProps {
  /** Defaults to the utensils glyph. */
  icon?: ReactNode;
  text: ReactNode;
  /** An optional button row under the text. */
  action?: ReactNode;
  className?: string;
}

/** UI-6: what a list shows when it has nothing in it yet. */
export function EmptyState({
  icon,
  text,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div className={cx('empty-state', className)}>
      {icon ?? <Icon.Utensils size={28} />}
      <span>{text}</span>
      {action}
    </div>
  );
}

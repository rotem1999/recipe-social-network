import { useEffect, useId } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { cx } from './class-names';

export interface DialogProps {
  title: ReactNode;
  children?: ReactNode;
  /** The button row; rendered in the guide's `.dialog-actions`. */
  actions?: ReactNode;
  /** Called on a backdrop click and on Escape. */
  onClose: () => void;
  className?: string;
}

/** UI-3: the guide's `.dialog-backdrop` + `.dialog` at the top elevation. */
export function Dialog({
  title,
  children,
  actions,
  onClose,
  className,
}: DialogProps): ReactElement {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const stop = (event: MouseEvent<HTMLDivElement>): void =>
    event.stopPropagation();

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={cx('dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={stop}
      >
        <div className="dialog-title" id={titleId}>
          {title}
        </div>
        {children === undefined || children === null ? null : (
          <div className="dialog-body">{children}</div>
        )}
        {actions === undefined || actions === null ? null : (
          <div className="dialog-actions">{actions}</div>
        )}
      </div>
    </div>
  );
}

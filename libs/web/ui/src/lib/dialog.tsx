import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { cx } from './class-names';

export interface DialogProps {
  title: ReactNode;
  children?: ReactNode;
  /** The button row; rendered in the guide's `.dialog-actions`. */
  actions?: ReactNode;
  /** Called on a backdrop click (UI-22) and on Escape. */
  onClose: () => void;
  className?: string;
}

/** UI-27: what Tab and Shift+Tab can reach inside the panel. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('hidden'),
  );
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
  const panelRef = useRef<HTMLDivElement>(null);
  // UI-22: where the last press on the backdrop landed; null until one happened.
  const pressTarget = useRef<EventTarget | null>(null);
  // UI-27: the element that had focus when the dialog opened, read during the
  // first render, before anything inside the panel (autoFocus) can take focus.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // UI-27: Tab and Shift+Tab cycle inside the panel while it is open.
      const panel = panelRef.current;
      if (event.key !== 'Tab' || panel === null) {
        return;
      }
      // Only the top-most dialog traps focus when one opens over another.
      const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (open[open.length - 1] !== panel) {
        return;
      }
      const focusables = focusablesIn(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);
      if (event.shiftKey && (!inside || active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // UI-27: focus moves into the panel on open and back to the opener on close.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel !== null && !panel.contains(document.activeElement)) {
      (focusablesIn(panel)[0] ?? panel).focus();
    }
    return () => {
      if (opener !== null && opener.isConnected) {
        opener.focus();
      }
    };
  }, [opener]);

  const stop = (event: MouseEvent<HTMLDivElement>): void =>
    event.stopPropagation();

  const onBackdropMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    pressTarget.current = event.target;
  };

  // UI-22: a drag that starts inside the panel and ends on the backdrop never closes.
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    const pressed = pressTarget.current;
    pressTarget.current = null;
    if (
      event.target === event.currentTarget &&
      (pressed === null || pressed === event.currentTarget)
    ) {
      onClose();
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={onBackdropMouseDown}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        className={cx('dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
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

import type { ReactElement, ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ConfirmDialogProps {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

/** UI-12: the confirmation step in front of Delete and Remove from my recipes. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

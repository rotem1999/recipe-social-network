import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './dialog';

afterEach(cleanup);

/**
 * UI-3 fixes the dialog's look; SPEC.md does not state how a dialog is
 * dismissed, so the Escape and backdrop behaviours below are recorded as the
 * code behaves today and flagged UNSPECIFIED for Rotem.
 */
describe('Dialog (UI-3)', () => {
  it('UI-3 renders the CookBook dialog shell with its title and body', () => {
    const { container } = render(
      <Dialog title="Delete recipe" onClose={vi.fn()}>
        This cannot be undone.
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(container.querySelector('.dialog-title')?.textContent).toBe(
      'Delete recipe',
    );
    expect(container.querySelector('.dialog-body')?.textContent).toBe(
      'This cannot be undone.',
    );
    // The title element is the accessible name of the dialog.
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      container.querySelector('.dialog-title')?.id,
    );
  });

  it('UI-3 omits the body and the action row when neither is given', () => {
    const { container } = render(<Dialog title="Empty" onClose={vi.fn()} />);

    expect(container.querySelector('.dialog-body')).toBeNull();
    expect(container.querySelector('.dialog-actions')).toBeNull();
  });

  it('UI-3 renders the action row when actions are given', () => {
    const { container } = render(
      <Dialog title="Delete recipe" actions={<button>Delete</button>} onClose={vi.fn()} />,
    );

    expect(container.querySelector('.dialog-actions')?.textContent).toBe(
      'Delete',
    );
  });

  it('UNSPECIFIED calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<Dialog title="Delete recipe" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UNSPECIFIED ignores other keys', () => {
    const onClose = vi.fn();
    render(<Dialog title="Delete recipe" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('UNSPECIFIED calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="Delete recipe" onClose={onClose} />,
    );

    const backdrop = container.querySelector('.dialog-backdrop');
    if (backdrop === null) {
      throw new Error('the dialog backdrop was not rendered');
    }
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UNSPECIFIED keeps the dialog open when the panel itself is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Delete recipe" onClose={onClose}>
        This cannot be undone.
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('UNSPECIFIED stops listening for Escape once the dialog is unmounted', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Dialog title="Delete recipe" onClose={onClose} />,
    );

    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});

import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Dialog } from './dialog';

afterEach(cleanup);

/**
 * UI-3 fixes the dialog's look; UI-6 closes it on Escape and on a backdrop
 * click, never on a click inside the panel; UI-22 closes on the backdrop only
 * when the press and the release both land on it; UI-27 moves focus in, traps
 * Tab and Shift+Tab, and returns focus to the opener. Behaviours no SPEC row
 * names stay flagged UNSPECIFIED for Rotem.
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

  it('UI-6 calls onClose when Escape is pressed', () => {
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

  it('UI-6 calls onClose when the backdrop is clicked', () => {
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

  it('UI-6 keeps the dialog open when the panel itself is clicked', () => {
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

  it('UI-22 closes when the press and the release both land on the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="Delete recipe" onClose={onClose} />,
    );
    const backdrop = backdropOf(container);

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UI-22 stays open when a drag starts inside the panel and ends on the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="Delete recipe" onClose={onClose}>
        <input aria-label="Name" />
      </Dialog>,
    );
    const backdrop = backdropOf(container);

    // The browser fires click on the common ancestor, the backdrop.
    fireEvent.mouseDown(screen.getByLabelText('Name'));
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('UI-22 closes on a later real backdrop click after a drag from the panel', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="Delete recipe" onClose={onClose}>
        This cannot be undone.
      </Dialog>,
    );
    const backdrop = backdropOf(container);

    fireEvent.mouseDown(screen.getByRole('dialog'));
    fireEvent.click(backdrop);
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UI-27 moves focus to the first focusable element when it opens', () => {
    render(
      <Dialog
        title="Delete recipe"
        onClose={vi.fn()}
        actions={
          <>
            <button type="button">Cancel</button>
            <button type="button">Delete</button>
          </>
        }
      >
        <input aria-label="Reason" />
      </Dialog>,
    );

    expect(document.activeElement).toBe(screen.getByLabelText('Reason'));
  });

  it('UI-27 focuses the panel itself when it holds nothing focusable', () => {
    render(<Dialog title="Deleting…" onClose={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('UI-27 cycles Tab from the last focusable element back to the first', () => {
    render(<Dialog title="Delete recipe" onClose={vi.fn()} actions={ACTIONS} />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const remove = screen.getByRole('button', { name: 'Delete' });

    remove.focus();
    fireEvent.keyDown(remove, { key: 'Tab' });

    expect(document.activeElement).toBe(cancel);
  });

  it('UI-27 cycles Shift+Tab from the first focusable element to the last', () => {
    render(<Dialog title="Delete recipe" onClose={vi.fn()} actions={ACTIONS} />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const remove = screen.getByRole('button', { name: 'Delete' });

    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(remove);
  });

  it('UI-27 brings a Tab from outside the panel back to its first element', () => {
    render(
      <>
        <button type="button">Outside</button>
        <Dialog title="Delete recipe" onClose={vi.fn()} actions={ACTIONS} />
      </>,
    );
    const outside = screen.getByRole('button', { name: 'Outside' });

    outside.focus();
    fireEvent.keyDown(outside, { key: 'Tab' });

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
  });

  it('UI-27 returns focus to the element that opened it when it closes', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });

    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

/** Two action buttons: Cancel first, Delete last. */
const ACTIONS = (
  <>
    <button type="button">Cancel</button>
    <button type="button">Delete</button>
  </>
);

function backdropOf(container: HTMLElement): HTMLElement {
  const backdrop = container.querySelector('.dialog-backdrop');
  if (!(backdrop instanceof HTMLElement)) {
    throw new Error('the dialog backdrop was not rendered');
  }
  return backdrop;
}

/** A button that opens a dialog, the way screens open theirs. */
function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Dialog
          title="Delete recipe"
          onClose={() => setOpen(false)}
          actions={ACTIONS}
        />
      ) : null}
    </>
  );
}

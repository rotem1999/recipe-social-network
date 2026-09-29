import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Dialog } from './dialog';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// UI-42 checks the checked-in stylesheet (read-only): Vitest's default `css`
// setting blanks CSS imports, `?raw` included, so the text is read directly.
const tokensCss = readFileSync(
  resolve(import.meta.dirname, '../styles/tokens.css'),
  'utf8',
);

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
    const { baseElement } = render(
      <Dialog title="Delete recipe" onClose={vi.fn()}>
        This cannot be undone.
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(baseElement.querySelector('.dialog-title')?.textContent).toBe(
      'Delete recipe',
    );
    expect(baseElement.querySelector('.dialog-body')?.textContent).toBe(
      'This cannot be undone.',
    );
    // The title element is the accessible name of the dialog.
    expect(dialog.getAttribute('aria-labelledby')).toBe(
      baseElement.querySelector('.dialog-title')?.id,
    );
  });

  it('UI-3 omits the body and the action row when neither is given', () => {
    const { baseElement } = render(<Dialog title="Empty" onClose={vi.fn()} />);

    expect(baseElement.querySelector('.dialog-body')).toBeNull();
    expect(baseElement.querySelector('.dialog-actions')).toBeNull();
  });

  it('UI-3 renders the action row when actions are given', () => {
    const { baseElement } = render(
      <Dialog title="Delete recipe" actions={<button>Delete</button>} onClose={vi.fn()} />,
    );

    expect(baseElement.querySelector('.dialog-actions')?.textContent).toBe(
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
    const { baseElement } = render(
      <Dialog title="Delete recipe" onClose={onClose} />,
    );

    const backdrop = baseElement.querySelector('.dialog-backdrop');
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
    const { baseElement } = render(
      <Dialog title="Delete recipe" onClose={onClose} />,
    );
    const backdrop = backdropOf(baseElement);

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('UI-22 stays open when a drag starts inside the panel and ends on the backdrop', () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <Dialog title="Delete recipe" onClose={onClose}>
        <input aria-label="Name" />
      </Dialog>,
    );
    const backdrop = backdropOf(baseElement);

    // The browser fires click on the common ancestor, the backdrop.
    fireEvent.mouseDown(screen.getByLabelText('Name'));
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('UI-22 closes on a later real backdrop click after a drag from the panel', () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <Dialog title="Delete recipe" onClose={onClose}>
        This cannot be undone.
      </Dialog>,
    );
    const backdrop = backdropOf(baseElement);

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

/**
 * UI-42: the dialog renders into `document.body` through a portal, outside the
 * screen that opens it, and its backdrop sits at `--z-dialog`, above every other
 * elevation in the `libs/web/ui` stylesheet.
 */
describe('Dialog portal and elevation (UI-42)', () => {
  it('UI-42 renders the backdrop as a direct child of document.body, not inside the opening screen', () => {
    const { container } = render(
      <section className="washed" data-testid="screen">
        <Dialog title="Remove recipe" onClose={vi.fn()} actions={ACTIONS} />
      </section>,
    );

    const screenElement = screen.getByTestId('screen');
    const backdrop = backdropOf(document.body);
    expect(backdrop.parentElement).toBe(document.body);
    expect(screenElement.contains(backdrop)).toBe(false);
    expect(container.contains(backdrop)).toBe(false);
    expect(backdrop.contains(screen.getByRole('dialog'))).toBe(true);
  });

  it('UI-42 removes the portalled backdrop from document.body when the dialog unmounts', () => {
    const { unmount } = render(
      <Dialog title="Remove recipe" onClose={vi.fn()} />,
    );
    expect(document.body.querySelector('.dialog-backdrop')).not.toBeNull();

    unmount();

    expect(document.body.querySelector('.dialog-backdrop')).toBeNull();
  });

  it('UI-42 defines --z-dialog and puts .dialog-backdrop at var(--z-dialog)', () => {
    const zDialog = zDialogValue();
    expect(zDialog).toBeGreaterThan(0);
    expect(tokensCss).toMatch(
      /\.dialog-backdrop\s*\{[^}]*z-index:\s*var\(--z-dialog\)\s*;/,
    );
  });

  it('UI-42 keeps every other z-index in the ui stylesheet below --z-dialog', () => {
    const zDialog = zDialogValue();
    const numeric = [...tokensCss.matchAll(/z-index:\s*(-?\d+)\s*;/g)].map(
      (match) => Number(match[1]),
    );

    expect(numeric.length).toBeGreaterThan(0);
    for (const value of numeric) {
      expect(value).toBeLessThan(zDialog);
    }
  });
});

/** The `--z-dialog` value declared in the ui stylesheet. */
function zDialogValue(): number {
  const match = /--z-dialog:\s*(\d+)\s*;/.exec(tokensCss);
  if (match === null) {
    throw new Error('--z-dialog is not declared in tokens.css');
  }
  return Number(match[1]);
}

/** Two action buttons: Cancel first, Delete last. */
const ACTIONS = (
  <>
    <button type="button">Cancel</button>
    <button type="button">Delete</button>
  </>
);

function backdropOf(root: HTMLElement): HTMLElement {
  const backdrop = root.querySelector('.dialog-backdrop');
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

// SPEC.md UI-3 (the guide's `textarea.input`) and UI-37: the textarea carries
// the `input` class that the stylesheet's `textarea.input` radius rule targets
// (the stylesheet rule itself is not readable under Vitest: CSS loads empty).
import { cleanup, render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

afterEach(cleanup);

describe('Textarea', () => {
  it('UI-37 renders a textarea with the input class the --radius-lg rule targets', () => {
    render(<Textarea aria-label="Description" className="extra" dir="auto" />);

    const box = screen.getByRole('textbox', { name: 'Description' });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.classList.contains('input')).toBe(true);
    expect(box.classList.contains('extra')).toBe(true);
    expect(box.getAttribute('dir')).toBe('auto');
  });
});

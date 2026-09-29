import { afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { StarAverage } from './star-average';

afterEach(cleanup);

/** The coloured row of RATE-3; its inline width carries the rounded average. */
function fullRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>('.stars-full');
  if (row === null) {
    throw new Error('the coloured star row was not rendered');
  }
  return row;
}

describe('StarAverage (RATE-3)', () => {
  it('RATE-3 clips the coloured row to the average rounded up to the nearest quarter star', () => {
    // 4.13 → 4.25 of 5 → 85%.
    const { container } = render(<StarAverage average={4.13} count={8} />);

    expect(fullRow(container).style.width).toBe('85%');
  });

  it('RATE-3 clips the coloured row to the average rounded down to the nearest quarter star', () => {
    // 3.1 → 3 of 5 → 60%.
    const { container } = render(<StarAverage average={3.1} count={4} />);

    expect(fullRow(container).style.width).toBe('60%');
  });

  it('RATE-3 renders a half star as 90% for an average of 4.38', () => {
    // 4.38 → 4.5 of 5 → 90%.
    const { container } = render(<StarAverage average={4.38} count={13} />);

    expect(fullRow(container).style.width).toBe('90%');
  });

  it('RATE-3 renders a full five stars as 100%', () => {
    const { container } = render(<StarAverage average={5} count={2} />);

    expect(fullRow(container).style.width).toBe('100%');
  });

  it('RATE-3 shows the decimal with two digits in the row title and caption', () => {
    const { container } = render(<StarAverage average={4.13} count={8} />);

    const row = container.querySelector<HTMLElement>('.stars-row');
    expect(row?.getAttribute('title')).toBe('4.13 out of 5');
    expect(container.querySelector('.stars-decimal')?.textContent).toBe('4.13');
  });

  it('RATE-2 keeps two digits after the decimal point for a whole average', () => {
    const { container } = render(<StarAverage average={4} count={3} />);

    expect(container.querySelector<HTMLElement>('.stars-row')?.title).toBe(
      '4.00 out of 5',
    );
    expect(container.querySelector('.stars-decimal')?.textContent).toBe('4.00');
  });

  it('RATE-3 shows "No ratings yet" and an empty coloured row when the count is 0', () => {
    const { container } = render(<StarAverage average={null} count={0} />);

    expect(fullRow(container).style.width).toBe('0%');
    expect(container.querySelector('.stars-decimal')).toBeNull();
    expect(container.querySelector<HTMLElement>('.stars-row')?.title).toBe(
      'No ratings yet',
    );
    expect(container.textContent).toContain('No ratings yet');
  });

  it('RATE-3 shows "No ratings yet" when an average arrives with a count of 0', () => {
    const { container } = render(<StarAverage average={4.5} count={0} />);

    expect(fullRow(container).style.width).toBe('0%');
    expect(container.textContent).toContain('No ratings yet');
  });

  it('UI-13 shows the rating count beside the stars, singular for one rating', () => {
    const one = render(<StarAverage average={5} count={1} />);
    expect(one.container.textContent).toContain('1 rating');

    cleanup();

    const many = render(<StarAverage average={4.25} count={12} />);
    expect(many.container.textContent).toContain('12 ratings');
  });

  it('UI-13 names the row for assistive technology with the decimal and the count', () => {
    const { container } = render(<StarAverage average={4.13} count={8} />);

    expect(
      container.querySelector('.stars-row')?.getAttribute('aria-label'),
    ).toBe('4.13 out of 5, 8 ratings');
  });

  it('RATE-3 applies the requested star size to the star row', () => {
    const { container } = render(
      <StarAverage average={4} count={1} size={17} />,
    );

    expect(container.querySelector<HTMLElement>('.stars')?.style.fontSize).toBe(
      '17px',
    );
  });
});

import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StarInput } from './star-input';

afterEach(cleanup);

describe('StarInput (RATE-1)', () => {
  it('RATE-1 offers exactly five whole stars, 1 to 5', () => {
    render(<StarInput value={null} onRate={vi.fn()} />);

    const stars = screen.getAllByRole('radio');
    expect(stars).toHaveLength(5);
    expect(stars.map((star) => star.getAttribute('aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ]);
  });

  it('RATE-1 calls onRate with 4 when the fourth star is clicked', () => {
    const onRate = vi.fn();
    render(<StarInput value={null} onRate={onRate} />);

    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));

    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(4);
  });

  it('RATE-1 reports only whole stars, one integer per button', () => {
    const onRate = vi.fn();
    render(<StarInput value={null} onRate={onRate} />);

    for (const star of screen.getAllByRole('radio')) {
      fireEvent.click(star);
    }

    expect(onRate.mock.calls.map(([stars]) => stars)).toEqual([1, 2, 3, 4, 5]);
  });

  it('RATE-1 marks the viewer own grade as the checked star', () => {
    render(<StarInput value={3} onRate={vi.fn()} />);

    expect(
      screen
        .getAllByRole('radio')
        .map((star) => star.getAttribute('aria-checked')),
    ).toEqual(['false', 'false', 'true', 'false', 'false']);
  });

  it('RATE-1 lights every star up to the viewer own grade', () => {
    const { container } = render(<StarInput value={3} onRate={vi.fn()} />);

    expect(container.querySelectorAll('button.is-on')).toHaveLength(3);
  });

  it('RATE-1 previews the hovered grade without calling onRate', () => {
    const onRate = vi.fn();
    const { container } = render(<StarInput value={1} onRate={onRate} />);

    fireEvent.mouseEnter(screen.getByRole('radio', { name: '4 stars' }));

    expect(container.querySelectorAll('button.is-on')).toHaveLength(4);
    expect(onRate).not.toHaveBeenCalled();
  });

  it('RATE-1 disables every star and reports nothing when disabled', () => {
    const onRate = vi.fn();
    render(<StarInput value={null} onRate={onRate} disabled />);

    const stars = screen.getAllByRole('radio');
    for (const star of stars) {
      expect((star as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(star);
    }

    expect(onRate).not.toHaveBeenCalled();
  });
});

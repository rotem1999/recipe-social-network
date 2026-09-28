import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VoteControl } from './vote-control';

afterEach(cleanup);

describe('VoteControl (COM-2)', () => {
  it('COM-2 calls onVote(1) when the up arrow is clicked without a vote', () => {
    const onVote = vi.fn();
    render(<VoteControl points={3} myVote={0} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upvote' }));

    expect(onVote).toHaveBeenCalledTimes(1);
    expect(onVote).toHaveBeenCalledWith(1);
  });

  it('COM-2 calls onVote(-1) when the down arrow is clicked without a vote', () => {
    const onVote = vi.fn();
    render(<VoteControl points={3} myVote={0} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Downvote' }));

    expect(onVote).toHaveBeenCalledWith(-1);
  });

  it('COM-2 clears the vote with onVote(0) when the active up arrow is clicked again', () => {
    const onVote = vi.fn();
    render(<VoteControl points={4} myVote={1} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Upvote' }));

    expect(onVote).toHaveBeenCalledWith(0);
  });

  it('COM-2 clears the vote with onVote(0) when the active down arrow is clicked again', () => {
    const onVote = vi.fn();
    render(<VoteControl points={-2} myVote={-1} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Downvote' }));

    expect(onVote).toHaveBeenCalledWith(0);
  });

  it('COM-2 switches sides with onVote(-1) when the down arrow is clicked while upvoted', () => {
    const onVote = vi.fn();
    render(<VoteControl points={4} myVote={1} onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Downvote' }));

    expect(onVote).toHaveBeenCalledWith(-1);
  });

  it('COM-2 shows the integer points between the arrows', () => {
    const { container } = render(
      <VoteControl points={-7} myVote={0} onVote={vi.fn()} />,
    );

    expect(container.querySelector('.vote-points')?.textContent).toBe('-7');
  });

  it('COM-2 marks the arrow the viewer pressed', () => {
    render(<VoteControl points={4} myVote={1} onVote={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Upvote' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Downvote' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('COM-2 disables both arrows and reports nothing when disabled', () => {
    const onVote = vi.fn();
    render(<VoteControl points={0} myVote={0} onVote={onVote} disabled />);

    const up = screen.getByRole('button', { name: 'Upvote' });
    const down = screen.getByRole('button', { name: 'Downvote' });
    expect((up as HTMLButtonElement).disabled).toBe(true);
    expect((down as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(up);
    fireEvent.click(down);

    expect(onVote).not.toHaveBeenCalled();
  });
});

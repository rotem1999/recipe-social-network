// SPEC.md UI-32 (Enter posts; each comment shows its age, and from 7 days on
// its date; the list is reloaded after a post so the server's COM-3 order
// holds; Delete asks "Delete this comment?"), COM-3 (only the author deletes)
// and UI-41 (comments are user text, so they carry dir="auto"); UI-46 (the date
// and hover formats) and UI-50 (the comment text is its own bidi-text element).
// `@rsn/web/data-access-api` is mocked at the module boundary.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { CommentDto, CommentsResponse } from '@rsn/shared/util-contracts';
import { CommentsSection } from './comments-section';

const mocks = vi.hoisted(() => ({
  api: {
    listComments: vi.fn(),
    postComment: vi.fn(),
    deleteComment: vi.fn(),
    vote: vi.fn(),
  },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
    useAuth: () => ({
      user: {
        id: 'u1',
        username: 'rotem',
        email: null,
        favouriteCategories: [],
        createdAt: '2026-09-01T08:00:00.000Z',
      },
      status: 'signed-in',
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    }),
  };
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function comment(patch: Partial<CommentDto> & { id: string }): CommentDto {
  return {
    recipeId: 'r1',
    authorId: 'u2',
    authorUsername: 'noa',
    body: 'Lovely.',
    points: 0,
    myVote: 0,
    createdAt: ago(10 * MINUTE),
    ...patch,
  };
}

function list(comments: CommentDto[]): CommentsResponse {
  return { comments, votesEnabled: false };
}

function rowOf(body: string): HTMLElement {
  const row = screen.getByText(body).closest('.comment');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no comment row for ${body}`);
  }
  return row;
}

describe('CommentsSection', () => {
  beforeEach(() => {
    mocks.api.listComments.mockReset().mockResolvedValue(list([]));
    mocks.api.postComment.mockReset();
    mocks.api.deleteComment.mockReset().mockResolvedValue(undefined);
    mocks.api.vote.mockReset();
  });

  it('UI-32 posts the comment when Enter is pressed in the input', async () => {
    mocks.api.postComment.mockResolvedValue(
      comment({ id: 'c9', authorId: 'u1', body: 'Made it twice.' }),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);
    await waitFor(() =>
      expect(mocks.api.listComments).toHaveBeenCalledTimes(1),
    );

    const input = screen.getByLabelText('Add a comment') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Made it twice.  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.api.postComment).toHaveBeenCalledWith('r1', {
        body: 'Made it twice.',
      }),
    );
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('UI-32 posts nothing when Enter is pressed on an empty or blank draft', async () => {
    render(<CommentsSection recipeId="r1" hasVotes={false} />);
    await waitFor(() =>
      expect(mocks.api.listComments).toHaveBeenCalledTimes(1),
    );

    const input = screen.getByLabelText('Add a comment');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.api.postComment).not.toHaveBeenCalled();
  });

  it('UI-32 COM-3 reloads the list after a post so the new comment sits where the server puts it', async () => {
    const top = comment({ id: 'c1', body: 'Great recipe.', points: 3 });
    const bottom = comment({ id: 'c2', body: 'Too salty.', points: -1 });
    const mine = comment({
      id: 'c9',
      authorId: 'u1',
      authorUsername: 'rotem',
      body: 'Made it twice.',
      createdAt: ago(0),
    });
    mocks.api.listComments
      .mockResolvedValueOnce(list([top, bottom]))
      .mockResolvedValueOnce(list([top, mine, bottom]));
    mocks.api.postComment.mockResolvedValue(mine);
    const { container } = render(
      <CommentsSection recipeId="r1" hasVotes={false} />,
    );
    await screen.findByText('Great recipe.');

    fireEvent.change(screen.getByLabelText('Add a comment'), {
      target: { value: 'Made it twice.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));

    await screen.findByText('Made it twice.');
    expect(mocks.api.listComments).toHaveBeenCalledTimes(2);
    expect(
      Array.from(container.querySelectorAll('.comment [dir="auto"]')).map(
        (element) => element.textContent,
      ),
    ).toEqual(['Great recipe.', 'Made it twice.', 'Too salty.']);
    expect(screen.getByText('3 comments')).toBeTruthy();
  });

  it('UI-32 shows each comment age next to its author: just now, min, h and d', async () => {
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({ id: 'c1', body: 'First.', createdAt: ago(20_000) }),
        comment({ id: 'c2', body: 'Second.', createdAt: ago(5 * MINUTE + 10_000) }),
        comment({ id: 'c3', body: 'Third.', createdAt: ago(2 * HOUR + 5 * MINUTE) }),
        comment({ id: 'c4', body: 'Fourth.', createdAt: ago(3 * DAY + HOUR) }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    await screen.findByText('First.');
    const age = (body: string): string | null =>
      rowOf(body).querySelector('.comment-author time')?.textContent ?? null;
    expect(age('First.')).toBe('just now');
    expect(age('Second.')).toBe('5 min ago');
    expect(age('Third.')).toBe('2 h ago');
    expect(age('Fourth.')).toBe('3 d ago');
    expect(
      within(rowOf('First.')).getByText('noa', { exact: false }),
    ).toBeTruthy();
  });

  it('UI-32 shows "6 d ago" just under a week and switches to the date at 7 days', async () => {
    const weekOld = ago(7 * DAY + MINUTE);
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({ id: 'c1', body: 'Six days.', createdAt: ago(6 * DAY + 23 * HOUR) }),
        comment({ id: 'c2', body: 'Seven days.', createdAt: weekOld }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    await screen.findByText('Six days.');
    const age = (body: string): string =>
      rowOf(body).querySelector('.comment-author time')?.textContent ?? '';
    expect(age('Six days.')).toBe('6 d ago');
    expect(age('Seven days.')).not.toMatch(/ago$/);
    expect(age('Seven days.')).toContain(
      String(new Date(weekOld).getFullYear()),
    );
  });

  it('UI-32 writes the date of a comment older than 7 days as "3 Sep 2026"', async () => {
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({
          id: 'c1',
          body: 'From early September.',
          createdAt: '2026-09-03T12:00:00.000Z',
        }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    await screen.findByText('From early September.');
    expect(
      rowOf('From early September.').querySelector('.comment-author time')
        ?.textContent,
    ).toBe('3 Sep 2026');
  });

  it('UI-46 writes an old comment date with formatDate and its hover text with formatDateTime', async () => {
    // Local time, so the expected text holds in any time zone.
    const createdAt = new Date(2026, 8, 3, 14, 5).toISOString();
    mocks.api.listComments.mockResolvedValue(
      list([comment({ id: 'c1', body: 'Early September.', createdAt })]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    await screen.findByText('Early September.');
    const time = rowOf('Early September.').querySelector('.comment-author time');
    expect(time?.textContent).toBe('3 Sep 2026');
    expect(time?.getAttribute('title')).toBe('3 Sep 2026, 14:05');
    expect(time?.getAttribute('dateTime')).toBe(createdAt);
  });

  it('UI-46 gives a recent comment the "29 Sep 2026, 01:07" hover text next to its age', async () => {
    const created = new Date(Date.now() - 2 * HOUR - 5 * MINUTE);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const expected = `${created.getDate()} ${months[created.getMonth()]} ${created.getFullYear()}, ${pad(created.getHours())}:${pad(created.getMinutes())}`;
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({ id: 'c1', body: 'Recent.', createdAt: created.toISOString() }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    await screen.findByText('Recent.');
    const time = rowOf('Recent.').querySelector('.comment-author time');
    expect(time?.textContent).toBe('2 h ago');
    expect(time?.getAttribute('title')).toBe(expected);
  });

  it('UI-50 puts the comment text in its own bidi-text element', async () => {
    mocks.api.listComments.mockResolvedValue(
      list([comment({ id: 'c1', body: 'טעים מאוד' })]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    const body = await screen.findByText('טעים מאוד');
    expect(body.getAttribute('dir')).toBe('auto');
    expect(body.classList.contains('bidi-text')).toBe(true);
    // The row around it keeps the page's direction.
    expect(rowOf('טעים מאוד').hasAttribute('dir')).toBe(false);
  });

  it('UI-32 asks "Delete this comment?" and deletes only after Delete', async () => {
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({ id: 'c1', authorId: 'u1', authorUsername: 'rotem', body: 'Mine.' }),
        comment({ id: 'c2', body: 'Theirs.' }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);
    await screen.findByText('Mine.');

    fireEvent.click(
      within(rowOf('Mine.')).getByRole('button', { name: 'Delete comment' }),
    );

    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Delete this comment?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.api.deleteComment).not.toHaveBeenCalled();
    expect(screen.getByText('Mine.')).toBeTruthy();

    fireEvent.click(
      within(rowOf('Mine.')).getByRole('button', { name: 'Delete comment' }),
    );
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(mocks.api.deleteComment).toHaveBeenCalledWith('c1'),
    );
    await waitFor(() => expect(screen.queryByText('Mine.')).toBeNull());
    expect(screen.getByText('Theirs.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("COM-3 offers Delete only on the caller's own comments", async () => {
    mocks.api.listComments.mockResolvedValue(
      list([
        comment({ id: 'c1', authorId: 'u1', authorUsername: 'rotem', body: 'Mine.' }),
        comment({ id: 'c2', body: 'Theirs.' }),
      ]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);
    await screen.findByText('Theirs.');

    expect(
      within(rowOf('Theirs.')).queryByRole('button', { name: 'Delete comment' }),
    ).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(
      1,
    );
  });

  it('UI-41 gives the comment text and the comment input dir="auto"', async () => {
    mocks.api.listComments.mockResolvedValue(
      list([comment({ id: 'c1', body: 'טעים מאוד' })]),
    );
    render(<CommentsSection recipeId="r1" hasVotes={false} />);

    expect((await screen.findByText('טעים מאוד')).getAttribute('dir')).toBe(
      'auto',
    );
    expect(screen.getByLabelText('Add a comment').getAttribute('dir')).toBe(
      'auto',
    );
  });
});

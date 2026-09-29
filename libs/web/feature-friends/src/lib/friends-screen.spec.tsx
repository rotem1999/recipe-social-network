// SPEC.md §4 (FR-2, FR-4): the friends screen. The API layer is mocked at the
// module boundary, so every endpoint here is a vi.fn (libs/web/CLAUDE.md).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type {
  FriendsResponse,
  UserDto,
  UserSearchResponse,
} from '@rsn/shared/util-contracts';
import { FriendsScreen } from './friends-screen';

const mocks = vi.hoisted(() => ({
  api: {
    getFriends: vi.fn(),
    searchUsers: vi.fn(),
    sendFriendRequest: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    cancelRequest: vi.fn(),
    removeFriend: vi.fn(),
  },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
    useAuth: () => ({
      user: USER,
      status: 'signed-in',
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

const USER: UserDto = {
  id: 'u1',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-01T08:00:00.000Z',
};

const EMPTY: FriendsResponse = { friends: [], incoming: [], outgoing: [] };

const WITH_INCOMING: FriendsResponse = {
  friends: [],
  incoming: [
    {
      id: 'req-1',
      fromUserId: 'u2',
      fromUsername: 'noa',
      toUserId: 'u1',
      toUsername: 'rotem',
      createdAt: '2026-09-20T09:00:00.000Z',
    },
  ],
  outgoing: [],
};

const AFTER_ACCEPT: FriendsResponse = {
  friends: [
    { userId: 'u2', username: 'noa', since: '2026-09-28T09:00:00.000Z' },
  ],
  incoming: [],
  outgoing: [],
};

const SEARCH_HIT: UserSearchResponse = {
  users: [
    {
      id: 'u2',
      username: 'noa',
      isSelf: false,
      isFriend: false,
      pendingRequestId: null,
    },
  ],
};

/** The debounce of the search box is 300 ms; this outlasts it. */
const AFTER_DEBOUNCE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('FriendsScreen', () => {
  beforeEach(() => {
    mocks.api.getFriends.mockReset().mockResolvedValue(EMPTY);
    mocks.api.searchUsers.mockReset().mockResolvedValue({ users: [] });
    mocks.api.sendFriendRequest.mockReset().mockResolvedValue(EMPTY);
    mocks.api.acceptRequest.mockReset().mockResolvedValue(EMPTY);
    mocks.api.declineRequest.mockReset().mockResolvedValue(EMPTY);
    mocks.api.cancelRequest.mockReset().mockResolvedValue(EMPTY);
    mocks.api.removeFriend.mockReset().mockResolvedValue(EMPTY);
  });

  it('FR-2 offers Accept and Decline on an incoming request', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_INCOMING);
    render(<FriendsScreen />);

    expect(await screen.findByText('Friend requests')).toBeTruthy();
    expect(screen.getByText('noa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
  });

  it('FR-2 replaces the lists with the FriendsResponse that Accept returns', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_INCOMING);
    mocks.api.acceptRequest.mockResolvedValue(AFTER_ACCEPT);
    render(<FriendsScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(mocks.api.acceptRequest).toHaveBeenCalledWith('req-1'),
    );
    await waitFor(() => expect(screen.queryByText('Friend requests')).toBeNull());

    const friends = screen.getByText('Your friends').parentElement;
    expect(friends).not.toBeNull();
    expect(within(friends as HTMLElement).getByText('noa')).toBeTruthy();
    // UI-38: rows under "Your friends" carry no "Friends" tag.
    expect(within(friends as HTMLElement).queryByText('Friends')).toBeNull();
    expect(
      within(friends as HTMLElement).getByRole('button', { name: 'Remove' }),
    ).toBeTruthy();
  });

  it('FR-4 does not search while the query is under two characters', async () => {
    render(<FriendsScreen />);
    await waitFor(() => expect(mocks.api.getFriends).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Find by username or email'), {
      target: { value: 'n' },
    });
    await sleep(AFTER_DEBOUNCE_MS);

    expect(mocks.api.searchUsers).not.toHaveBeenCalled();
    expect(screen.queryByText('Search results')).toBeNull();
  });

  it('FR-4 searches from two characters and flips Send request to Request sent', async () => {
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    mocks.api.sendFriendRequest.mockResolvedValue({
      friends: [],
      incoming: [],
      outgoing: [
        {
          id: 'req-2',
          fromUserId: 'u1',
          fromUsername: 'rotem',
          toUserId: 'u2',
          toUsername: 'noa',
          createdAt: '2026-09-28T10:00:00.000Z',
        },
      ],
    });
    render(<FriendsScreen />);

    fireEvent.change(screen.getByLabelText('Find by username or email'), {
      target: { value: 'no' },
    });

    const send = await screen.findByRole(
      'button',
      { name: 'Send request' },
      { timeout: 2000 },
    );
    expect(mocks.api.searchUsers).toHaveBeenCalledWith('no');

    fireEvent.click(send);

    await waitFor(() =>
      expect(mocks.api.sendFriendRequest).toHaveBeenCalledWith('u2'),
    );
    expect(await screen.findByText('Request sent')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull();
  });

  it('UI-26 shows no empty state while GET /friends is still pending', async () => {
    mocks.api.getFriends.mockReturnValue(new Promise<FriendsResponse>(() => undefined));
    render(<FriendsScreen />);

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText(EMPTY_FRIENDS_TEXT)).toBeNull();
  });

  it('UI-26 shows the error and Try again instead of the empty state when GET /friends fails', async () => {
    mocks.api.getFriends.mockRejectedValueOnce(new Error(SERVER_DOWN));
    render(<FriendsScreen />);

    expect(await screen.findByText(SERVER_DOWN)).toBeTruthy();
    expect(screen.queryByText(EMPTY_FRIENDS_TEXT)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(EMPTY_FRIENDS_TEXT)).toBeTruthy();
    expect(mocks.api.getFriends).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(SERVER_DOWN)).toBeNull();
  });

  it('UI-26 shows the empty state once GET /friends succeeded with no friends', async () => {
    render(<FriendsScreen />);

    expect(await screen.findByText(EMPTY_FRIENDS_TEXT)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('UI-34 offers Accept and Decline on the search row of a user who sent a request', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_INCOMING);
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    render(<FriendsScreen />);
    await screen.findByText('Friend requests');

    await typeQuery('no');

    const row = await searchRow('noa');
    expect(within(row).getByText('Wants to be friends')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Send request' })).toBeNull();
  });

  it('UI-34 accepts from the search row and re-runs the search', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_INCOMING);
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    mocks.api.acceptRequest.mockResolvedValue(AFTER_ACCEPT);
    render(<FriendsScreen />);
    await screen.findByText('Friend requests');
    await typeQuery('no');

    fireEvent.click(
      within(await searchRow('noa')).getByRole('button', { name: 'Accept' }),
    );

    await waitFor(() =>
      expect(mocks.api.acceptRequest).toHaveBeenCalledWith('req-1'),
    );
    await waitFor(() => expect(mocks.api.searchUsers).toHaveBeenCalledTimes(2));
    expect(mocks.api.searchUsers).toHaveBeenLastCalledWith('no');
    // The FriendsResponse Accept returned makes the row a friend at once.
    expect(within(await searchRow('noa')).getByText('Friends')).toBeTruthy();
  });

  it('UI-34 re-runs the search after Send request', async () => {
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    render(<FriendsScreen />);
    await typeQuery('no');

    fireEvent.click(
      within(await searchRow('noa')).getByRole('button', {
        name: 'Send request',
      }),
    );

    await waitFor(() =>
      expect(mocks.api.sendFriendRequest).toHaveBeenCalledWith('u2'),
    );
    await waitFor(() => expect(mocks.api.searchUsers).toHaveBeenCalledTimes(2));
    expect(mocks.api.searchUsers).toHaveBeenLastCalledWith('no');
  });

  it('UI-34 re-runs the search after Decline', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_INCOMING);
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    render(<FriendsScreen />);
    await screen.findByText('Friend requests');
    await typeQuery('no');

    fireEvent.click(
      within(await searchRow('noa')).getByRole('button', { name: 'Decline' }),
    );

    await waitFor(() =>
      expect(mocks.api.declineRequest).toHaveBeenCalledWith('req-1'),
    );
    await waitFor(() => expect(mocks.api.searchUsers).toHaveBeenCalledTimes(2));
    expect(mocks.api.searchUsers).toHaveBeenLastCalledWith('no');
    // EMPTY came back: the row offers Send request again.
    expect(
      within(await searchRow('noa')).getByRole('button', {
        name: 'Send request',
      }),
    ).toBeTruthy();
  });

  it('UI-34 re-runs the search after Cancel on a sent request', async () => {
    mocks.api.getFriends.mockResolvedValue(WITH_OUTGOING);
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    render(<FriendsScreen />);
    await screen.findByText('Sent requests');
    await typeQuery('no');
    expect(within(await searchRow('noa')).getByText('Request sent')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(mocks.api.cancelRequest).toHaveBeenCalledWith('req-2'),
    );
    await waitFor(() => expect(mocks.api.searchUsers).toHaveBeenCalledTimes(2));
    expect(mocks.api.searchUsers).toHaveBeenLastCalledWith('no');
  });

  it('UI-34 re-runs the search after Remove is confirmed', async () => {
    mocks.api.getFriends.mockResolvedValue(AFTER_ACCEPT);
    mocks.api.searchUsers.mockResolvedValue(SEARCH_HIT);
    render(<FriendsScreen />);
    await typeQuery('no');
    expect(within(await searchRow('noa')).getByText('Friends')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() =>
      expect(mocks.api.removeFriend).toHaveBeenCalledWith('u2'),
    );
    await waitFor(() => expect(mocks.api.searchUsers).toHaveBeenCalledTimes(2));
    expect(mocks.api.searchUsers).toHaveBeenLastCalledWith('no');
  });
});

/** UI-26 fixtures: the empty state text and a mapped client error. */
const EMPTY_FRIENDS_TEXT =
  'No friends yet — find someone by username or email above.';
const SERVER_DOWN = "Can't reach CookBook's server.";

/** FR-4: a request the caller sent to noa, still pending. */
const WITH_OUTGOING: FriendsResponse = {
  friends: [],
  incoming: [],
  outgoing: [
    {
      id: 'req-2',
      fromUserId: 'u1',
      fromUsername: 'rotem',
      toUserId: 'u2',
      toUsername: 'noa',
      createdAt: '2026-09-28T10:00:00.000Z',
    },
  ],
};

/** Types into the search box and waits for the debounced search to run. */
async function typeQuery(value: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('Find by username or email'), {
    target: { value },
  });
  await waitFor(
    () => expect(mocks.api.searchUsers).toHaveBeenCalledWith(value),
    { timeout: 2000 },
  );
}

/** The row of `username` under "Search results". */
async function searchRow(username: string): Promise<HTMLElement> {
  const section = (await screen.findByText('Search results')).parentElement;
  if (section === null) {
    throw new Error('the Search results section was not rendered');
  }
  const name = await within(section).findByText(username);
  const row = name.closest('.person-row');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no search row for ${username}`);
  }
  return row;
}

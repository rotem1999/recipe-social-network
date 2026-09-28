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
    expect(within(friends as HTMLElement).getByText('Friends')).toBeTruthy();
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
});

import { afterEach, beforeEach, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import type { UserDto } from '@rsn/shared/util-contracts';

import { ApiError, NETWORK_ERROR_MESSAGE, SERVER_ERROR_MESSAGE } from './client';
import { endpoints } from './endpoints';
import { AuthProvider, useAuth, useTimezone } from './hooks';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, tokenStore } from './tokens';

// The hooks call the shared endpoint set directly, so it is mocked at the
// module boundary; no request ever leaves the test.
vi.mock('./endpoints', () => ({
  endpoints: {
    me: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
  },
  createEndpoints: vi.fn(),
}));

const me = vi.mocked(endpoints.me);
const signIn = vi.mocked(endpoints.signIn);

const USER: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-28T10:00:00.000Z',
};

function AuthProbe(): ReactElement {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.username ?? '-'}</span>
    </div>
  );
}

/** UI-26: the status, the user and the Retry of the unreachable screen. */
function RetryProbe(): ReactElement {
  const { status, user, retry } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.username ?? '-'}</span>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  delete window.cookbook;
});

describe('useTimezone (UI-16)', () => {
  it('UI-16 prefers the IANA timezone the preload exposes on window.cookbook', () => {
    window.cookbook = { timezone: 'Asia/Jerusalem' };

    const { result } = renderHook(() => useTimezone());

    expect(result.current).toBe('Asia/Jerusalem');
  });

  it('UI-16 falls back to the browser timezone when the preload is absent', () => {
    expect(window.cookbook).toBeUndefined();

    const { result } = renderHook(() => useTimezone());

    expect(result.current).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});

describe('AuthProvider (UI-17)', () => {
  it('UI-17 calls me() on mount when an access token is stored and reports signed-in', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockResolvedValue(USER);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    // AUTH-8: the status is 'loading' until GET /me settles.
    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );
    expect(me).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('user').textContent).toBe('rotem');
  });

  it('UI-17 does not call me() when no token is stored and reports signed-out', async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    await waitFor(() => expect(me).not.toHaveBeenCalled());
    expect(screen.getByTestId('user').textContent).toBe('-');
  });

  it('UI-26 shows sign-in and leaves the tokens when the first me() fails with a 4xx other than 0/5xx', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-access');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'stale-refresh');
    me.mockRejectedValue(new ApiError(404, 'User not found', 'Not Found'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
    // UI-26: only the client clears the pair; the next sign-in replaces it.
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('stale-access');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('stale-refresh');
    expect(screen.getByTestId('user').textContent).toBe('-');
  });

  it('UI-26 shows sign-in and leaves the tokens when the first me() rejects with a non-API error', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-access');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'stale-refresh');
    me.mockRejectedValue(new Error('Unexpected token < in JSON'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('stale-access');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('stale-refresh');
  });

  it('UI-26 reports unreachable and keeps the tokens when the first me() fails with status 0', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockRejectedValue(new ApiError(0, NETWORK_ERROR_MESSAGE));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );
    expect(screen.getByTestId('user').textContent).toBe('-');
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('UI-26 reports unreachable and keeps the tokens when the first me() fails with a 5xx', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockRejectedValue(new ApiError(503, SERVER_ERROR_MESSAGE));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('UI-26 retry() repeats GET /me and signs in once the server answers', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    let answer: (user: UserDto) => void = () => undefined;
    me.mockReturnValueOnce(
      new Promise<UserDto>((resolve) => {
        answer = resolve;
      }),
    );

    render(
      <AuthProvider>
        <RetryProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    // AUTH-8: back to 'loading' while the repeated GET /me is in flight.
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('loading'),
    );
    expect(me).toHaveBeenCalledTimes(2);

    act(() => answer(USER));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );
    expect(screen.getByTestId('user').textContent).toBe('rotem');
    expect(tokenStore.get()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
  });

  it('UI-26 retry() that fails again with a 5xx stays unreachable and keeps the tokens', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    me.mockRejectedValueOnce(new ApiError(502, SERVER_ERROR_MESSAGE));

    render(
      <AuthProvider>
        <RetryProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(me).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
  });

  it('UI-26 retry() whose GET /me fails with a 4xx shows sign-in', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    me.mockRejectedValueOnce(new ApiError(404, 'User not found'));

    render(
      <AuthProvider>
        <RetryProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('unreachable'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
  });

  it('UI-26 / UI-9 returns to sign-in at once when the client clears the tokens', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockResolvedValue(USER);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );

    // What the client does after a rejected refresh or a second 401.
    act(() => tokenStore.clear());

    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(screen.getByTestId('user').textContent).toBe('-');
  });

  it('UI-26 stays signed in when the tokens are replaced by a refresh', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockResolvedValue(USER);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );

    act(() => tokenStore.set('access-2', 'refresh-2'));

    expect(screen.getByTestId('status').textContent).toBe('signed-in');
    expect(screen.getByTestId('user').textContent).toBe('rotem');
  });

  it('UI-26 stops listening to the token store when the provider unmounts', async () => {
    const subscribe = vi.spyOn(tokenStore, 'subscribe');
    const unsubscribe = vi.fn();
    subscribe.mockReturnValue(unsubscribe);

    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    subscribe.mockRestore();
  });

  it('UI-26 refreshUser() keeps the session and the tokens when GET /me cannot reach the server', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockResolvedValueOnce(USER);
    me.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR_MESSAGE));
    let refreshed: UserDto | null | 'pending' = 'pending';

    function RefreshProbe(): ReactElement {
      const { status, user, refreshUser } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="user">{user?.username ?? '-'}</span>
          <button
            type="button"
            onClick={() => {
              void refreshUser().then((value) => {
                refreshed = value;
              });
            }}
          >
            Refresh
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <RefreshProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(refreshed).toBeNull());
    expect(me).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('status').textContent).toBe('signed-in');
    expect(screen.getByTestId('user').textContent).toBe('rotem');
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-1');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1');
  });

  it('UI-17 stores the pair returned by sign-in and exposes the user', async () => {
    signIn.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: USER,
    });

    function SignInProbe(): ReactElement {
      const { status, user, signIn: doSignIn } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <span data-testid="user">{user?.username ?? '-'}</span>
          <button
            type="button"
            onClick={() => {
              void doSignIn({ username: 'rotem', password: 'correct horse' });
            }}
          >
            Sign in
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );
    expect(tokenStore.get()).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    expect(screen.getByTestId('user').textContent).toBe('rotem');
  });

  it('AUTH-7 sign-out discards both tokens on the client only', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'access-1');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    me.mockResolvedValue(USER);

    function SignOutProbe(): ReactElement {
      const { status, signOut } = useAuth();
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <SignOutProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });
});

describe('AuthProvider sessionEnded (UI-44)', () => {
  function SessionProbe(): ReactElement {
    const { status, sessionEnded, signIn: doSignIn, signOut } = useAuth();
    return (
      <div>
        <span data-testid="status">{status}</span>
        <span data-testid="ended">{String(sessionEnded)}</span>
        <button
          type="button"
          onClick={() => {
            void doSignIn({ username: 'rotem', password: 'correct horse' }).catch(
              () => undefined,
            );
          }}
        >
          Sign in
        </button>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  /** Mounts a signed-in session on the shared token store. */
  async function renderSignedIn(): Promise<void> {
    tokenStore.set('access-1', 'refresh-1');
    me.mockResolvedValue(USER);
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );
  }

  beforeEach(() => {
    // The shared store keeps sessionEnded in memory between tests.
    tokenStore.clear();
  });

  it('UI-44 is false while signed in', async () => {
    await renderSignedIn();

    expect(screen.getByTestId('ended').textContent).toBe('false');
  });

  it('UI-44 turns true and shows sign-in when the client ends the session', async () => {
    await renderSignedIn();

    // What the client does after a rejected refresh or a second 401.
    act(() => tokenStore.endSession());

    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(screen.getByTestId('ended').textContent).toBe('true');
  });

  it('UI-44 stays false after a sign-out', async () => {
    await renderSignedIn();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
    expect(screen.getByTestId('ended').textContent).toBe('false');
  });

  it('UI-44 clears when a sign-out follows an ended session', async () => {
    await renderSignedIn();
    act(() => tokenStore.endSession());
    expect(screen.getByTestId('ended').textContent).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() =>
      expect(screen.getByTestId('ended').textContent).toBe('false'),
    );
  });

  it('UI-44 clears on the next successful sign-in', async () => {
    await renderSignedIn();
    act(() => tokenStore.endSession());
    expect(screen.getByTestId('ended').textContent).toBe('true');
    signIn.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: USER,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-in'),
    );
    expect(screen.getByTestId('ended').textContent).toBe('false');
  });

  it('UI-44 stays true after a failed sign-in (a wrong password) that follows an ended session', async () => {
    await renderSignedIn();
    act(() => tokenStore.endSession());
    signIn.mockRejectedValue(new ApiError(401, 'Unauthorized', 'Unauthorized'));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(screen.getByTestId('ended').textContent).toBe('true');
  });

  it('UI-44 stays false when a 401 arrives with no tokens stored', async () => {
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    // A wrong password on the sign-in screen: the client ends a session that never was.
    act(() => tokenStore.endSession());

    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(screen.getByTestId('ended').textContent).toBe('false');
  });
});

describe('useAuth (UI-17)', () => {
  it('UI-17 throws when it is used outside an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used inside an AuthProvider',
    );
  });
});

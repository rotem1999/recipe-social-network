import { afterEach, beforeEach, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import type { UserDto } from '@rsn/shared/util-contracts';

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

  it('AUTH-7 clears the stored pair and signs out when me() is rejected', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-access');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'stale-refresh');
    me.mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('signed-out'),
    );
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId('user').textContent).toBe('-');
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

describe('useAuth (UI-17)', () => {
  it('UI-17 throws when it is used outside an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used inside an AuthProvider',
    );
  });
});

// SPEC.md §11.5 UI-17: React hooks over the fetch client, no third-party data
// library. UI-16: the timezone comes from the preload with an Intl fallback.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from 'react';
import type {
  AuthResponse,
  SignInRequest,
  SignUpRequest,
  UserDto,
} from '@rsn/shared/util-contracts';
import { ApiError, isConnectivityError } from './client';
import { endpoints } from './endpoints';
import type { Endpoints } from './endpoints';
import { tokenStore } from './tokens';

/** Every §11.6 route, ready to call. */
export function useApi(): Endpoints {
  return endpoints;
}

/** What {@link useRequest} hands the screen. */
export interface UseRequestResult<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

/**
 * Runs `fn` on mount and whenever `deps` change, and again on `reload()`.
 * `setData` lets a screen apply an optimistic update (UI-14) without refetching.
 */
export function useRequest<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): UseRequestResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // The latest callback without making it a dependency: `deps` decides when to run.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fnRef.current().then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error(String(cause)));
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { data, error, loading, reload, setData };
}

/**
 * 'loading' until `GET /me` settles; then signed-in or signed-out (UI-9), or
 * 'unreachable' when that start-up `GET /me` failed with status 0 or a 5xx and
 * the stored tokens were kept (UI-26).
 */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'unreachable';

/** What {@link useAuth} exposes to the sign-in screen and the avatar menu (UI-9). */
export interface AuthContextValue {
  user: UserDto | null;
  status: AuthStatus;
  signIn: (body: SignInRequest) => Promise<UserDto>;
  signUp: (body: SignUpRequest) => Promise<UserDto>;
  signOut: () => void;
  refreshUser: () => Promise<UserDto | null>;
  /** UI-26: repeats the start-up `GET /me` from the 'unreachable' state, keeping the tokens. */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Props of {@link AuthProvider}. */
export interface AuthProviderProps {
  children?: ReactNode;
}

/**
 * Holds the signed-in user. On mount it calls `GET /me` when a token is stored
 * (AUTH-8); a rejected token is discarded by the client and the app shows the
 * auth screen (UI-9). UI-26: a start-up failure with status 0 or a 5xx keeps
 * the tokens and reports 'unreachable' until {@link AuthContextValue.retry}
 * succeeds, and whenever the tokens are cleared the status becomes signed-out.
 */
export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStore.hasAccessToken() ? 'loading' : 'signed-out',
  );
  // UI-26: bumped by retry() to run the start-up `GET /me` again.
  const [attempt, setAttempt] = useState(0);

  // UI-9 / UI-26: the client clears the pair when a refresh is rejected or a
  // request still answers 401 after it; the sign-in screen then shows at once.
  useEffect(
    () =>
      tokenStore.subscribe((tokens) => {
        if (tokens.accessToken === null) {
          setUser(null);
          setStatus('signed-out');
        }
      }),
    [],
  );

  const refreshUser = useCallback(async (): Promise<UserDto | null> => {
    if (!tokenStore.hasAccessToken()) {
      setUser(null);
      setStatus('signed-out');
      return null;
    }
    try {
      const current = await endpoints.me();
      setUser(current);
      setStatus('signed-in');
      return current;
    } catch {
      // UI-26: a 401 has already cleared the pair in the client, and the
      // subscription above signed out; any other failure (status 0, 5xx)
      // leaves the session as it is.
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!tokenStore.hasAccessToken()) {
      setStatus('signed-out');
      return;
    }
    setStatus('loading');
    endpoints.me().then(
      (current) => {
        if (!cancelled) {
          setUser(current);
          setStatus('signed-in');
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setUser(null);
          // UI-26: the tokens are cleared only by the client (a rejected
          // refresh or a second 401). Status 0 or a 5xx keeps them and offers
          // Retry; any other failure shows the sign-in screen.
          setStatus(isConnectivityError(cause) ? 'unreachable' : 'signed-out');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback((): void => {
    setAttempt((value) => value + 1);
  }, []);

  /** Stores the pair of AUTH-7 and adopts the user the API returned. */
  const adopt = useCallback((auth: AuthResponse): UserDto => {
    tokenStore.set(auth.accessToken, auth.refreshToken);
    setUser(auth.user);
    setStatus('signed-in');
    return auth.user;
  }, []);

  const signIn = useCallback(
    async (body: SignInRequest): Promise<UserDto> =>
      adopt(await endpoints.signIn(body)),
    [adopt],
  );

  const signUp = useCallback(
    async (body: SignUpRequest): Promise<UserDto> =>
      adopt(await endpoints.signUp(body)),
    [adopt],
  );

  // AUTH-7: sign-out only discards the tokens on the client.
  const signOut = useCallback((): void => {
    tokenStore.clear();
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signUp, signOut, refreshUser, retry }),
    [user, status, signIn, signUp, signOut, refreshUser, retry],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

/** The auth state; must be used inside an {@link AuthProvider}. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return value;
}

/** UI-16: the preload's IANA timezone, or the browser's own (web-e2e). */
export function useTimezone(): string {
  return useMemo(
    () =>
      window.cookbook?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
}

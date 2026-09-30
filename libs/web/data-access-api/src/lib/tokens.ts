// SPEC.md §11.5 UI-17: the access and refresh tokens live in localStorage under
// `cookbook.accessToken` / `cookbook.refreshToken`. AUTH-7: sign-out only discards
// them on the client, so this store is the whole session state.

/** localStorage key of the access JWT (UI-17). */
export const ACCESS_TOKEN_KEY = 'cookbook.accessToken';
/** localStorage key of the refresh JWT (UI-17). */
export const REFRESH_TOKEN_KEY = 'cookbook.refreshToken';

/** The pair held by the store; `null` means "not signed in" (AUTH-7). */
export interface Tokens {
  accessToken: string | null;
  refreshToken: string | null;
}

/** Called after every change to the stored pair. */
export type TokenListener = (tokens: Tokens) => void;

/** Removes a listener registered with {@link TokenStore.subscribe}. */
export type Unsubscribe = () => void;

/** Reads the value, returning null when localStorage is unavailable or blocked. */
function readKey(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Writes or removes the value, ignoring quota and privacy-mode failures. */
function writeKey(key: string, value: string | null): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) {
      return;
    }
    if (value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch {
    // localStorage can throw (disabled, full, private mode); tokens then live
    // only for the lifetime of this page, which still lets the app run.
  }
}

/**
 * Persistent holder of the JWT pair of AUTH-7. Every read and write is guarded,
 * and subscribers are notified so hooks can react to sign-in and sign-out.
 */
export class TokenStore {
  private readonly listeners = new Set<TokenListener>();
  // UI-44: true after the client ended a live session on a 401; a sign-out or
  // a new pair resets it. Kept in memory only, like the message it drives.
  private ended = false;

  /** UI-44: true when the last clear was a session ended by a 401, not a sign-out. */
  get sessionEnded(): boolean {
    return this.ended;
  }

  /** Current access JWT, or null when signed out (AUTH-8 sends no header then). */
  getAccessToken(): string | null {
    return readKey(ACCESS_TOKEN_KEY);
  }

  /** Current refresh JWT used by `POST /auth/refresh` (AUTH-7). */
  getRefreshToken(): string | null {
    return readKey(REFRESH_TOKEN_KEY);
  }

  /** Both tokens at once. */
  get(): Tokens {
    return {
      accessToken: this.getAccessToken(),
      refreshToken: this.getRefreshToken(),
    };
  }

  /** Stores the pair returned by sign-up, sign-in or refresh (AUTH-5..7). */
  set(accessToken: string, refreshToken: string): void {
    writeKey(ACCESS_TOKEN_KEY, accessToken);
    writeKey(REFRESH_TOKEN_KEY, refreshToken);
    this.ended = false;
    this.emit();
  }

  /** Discards both tokens on a user sign-out (AUTH-7); UI-44 shows no message then. */
  clear(): void {
    this.ended = false;
    this.discard();
  }

  /**
   * UI-26 / UI-44: discards both tokens because the API rejected the session
   * (a refused refresh, or a 401 after the one refresh). The session counts as
   * ended only when a token was stored; a 401 with none (a wrong password on
   * the sign-in screen) leaves {@link sessionEnded} as it was.
   */
  endSession(): void {
    if (this.getAccessToken() !== null || this.getRefreshToken() !== null) {
      this.ended = true;
    }
    this.discard();
  }

  private discard(): void {
    writeKey(ACCESS_TOKEN_KEY, null);
    writeKey(REFRESH_TOKEN_KEY, null);
    this.emit();
  }

  /** True when an access token is present. */
  hasAccessToken(): boolean {
    return this.getAccessToken() !== null;
  }

  /** Registers a change listener and returns the function that removes it. */
  subscribe(listener: TokenListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const tokens = this.get();
    for (const listener of this.listeners) {
      listener(tokens);
    }
  }
}

/** The store the shared {@link ApiClient} instance uses. */
export const tokenStore = new TokenStore();

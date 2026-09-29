// SPEC.md §11.5 UI-17: a small `fetch` client, base URL from `VITE_API_BASE_URL`,
// tokens in localStorage, one automatic refresh on 401. SPEC.md §11.6: JSON in and
// out, errors shaped as `ApiErrorResponse` (`{ statusCode, message, error }`).
// UI-26: network failures and 5xx answers reach the screen as CookBook's own
// words, and only a rejected refresh or a second 401 clears the tokens.
import type {
  ApiErrorResponse,
  AuthResponse,
} from '@rsn/shared/util-contracts';
import { TokenStore, tokenStore } from './tokens';

/** Base URL used when `VITE_API_BASE_URL` is not set (apps/api default port + §11.6 prefix). */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

/** `POST /auth/refresh` (AUTH-7); never retried, it is the retry. */
const REFRESH_PATH = '/auth/refresh';

/** UI-26: the message of every request that never got an HTTP answer (status 0). */
export const NETWORK_ERROR_MESSAGE = "Can't reach CookBook's server.";

/** UI-26: the message of every 5xx answer; the server's own text is never shown. */
export const SERVER_ERROR_MESSAGE =
  "Something went wrong on CookBook's server. Try again.";

/** HTTP verbs used by the §11.6 surface. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A non-2xx response from the API. `message` comes from `ApiErrorResponse`;
 * the array form produced by the global ValidationPipe (§11.6) is joined.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly error: string | undefined;

  constructor(status: number, message: string, error?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }
}

/**
 * UI-26: true for an error that says nothing about the session — the server
 * could not be reached (status 0) or failed itself (5xx).
 */
export function isConnectivityError(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500)
  );
}

/** UI-26: the status-0 error of a request that never got an HTTP answer. */
function networkError(): ApiError {
  return new ApiError(0, NETWORK_ERROR_MESSAGE);
}

/** UI-26: a single network call; a rejected `fetch` becomes {@link networkError}. */
async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    // "Failed to fetch" and friends never reach the screen (UI-26).
    throw networkError();
  }
}

/** Reads the `VITE_API_BASE_URL` of UI-17 and strips a trailing slash. */
function resolveBaseUrl(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  const base =
    configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** Turns a failed response into an ApiError, joining ValidationPipe message arrays. */
async function toApiError(response: Response): Promise<ApiError> {
  if (response.status >= 500) {
    // UI-26: "Internal server error" and similar texts never reach the screen.
    return new ApiError(response.status, SERVER_ERROR_MESSAGE);
  }
  let message =
    response.statusText || `Request failed with status ${response.status}`;
  let error: string | undefined;
  try {
    const body = (await response.json()) as ApiErrorResponse;
    if (Array.isArray(body?.message)) {
      message = body.message.join(', ');
    } else if (typeof body?.message === 'string' && body.message.length > 0) {
      message = body.message;
    }
    error = body?.error;
  } catch {
    // Not a JSON error body (proxy or network layer); the status text stands.
  }
  return new ApiError(response.status, message, error);
}

/** Parses a JSON body; 204 and empty bodies resolve to undefined (DELETE routes). */
async function parseBody<T>(response: Response): Promise<T> {
  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Typed `fetch` wrapper for every §11.6 route: attaches `Authorization: Bearer`
 * when a token exists (AUTH-8), and on a 401 exchanges the refresh token once
 * (AUTH-7) before retrying. UI-26: the tokens are cleared only when the refresh
 * answers 401 or 403 or the request still answers 401 after it; a network
 * failure (status 0) or a 5xx never clears them.
 */
export class ApiClient {
  readonly baseUrl: string;
  readonly tokens: TokenStore;
  private refreshing: Promise<boolean> | null = null;

  constructor(
    tokens: TokenStore = tokenStore,
    baseUrl: string = resolveBaseUrl(),
  ) {
    this.tokens = tokens;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /** GET a §11.6 route. */
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** POST a JSON body (omitted when `body` is undefined). */
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** PUT a JSON body. */
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  /** PATCH a JSON body. */
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /** DELETE a §11.6 route; routes that answer 204 resolve to undefined. */
  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }

  /** Multipart upload for `POST /recipes/:id/images` (IMG-3); field name `file`. */
  upload<T>(path: string, file: File): Promise<T> {
    const form = new FormData();
    form.append('file', file);
    return this.send<T>('POST', path, form);
  }

  /** JSON variant: serialises the body and sets the content type. */
  private request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return this.send<T>(method, path, payload);
  }

  /**
   * One request plus, on 401, one refresh-and-retry (AUTH-7). A refresh that
   * could not reach the server, or that failed with a 5xx, rejects with that
   * error and leaves the tokens in place (UI-26).
   */
  private async send<T>(
    method: HttpMethod,
    path: string,
    body?: BodyInit,
  ): Promise<T> {
    let response = await this.fetchOnce(method, path, body);

    if (response.status === 401 && path !== REFRESH_PATH) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        response = await this.fetchOnce(method, path, body);
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        // UI-26: still 401 after the one refresh; the app returns to sign-in (UI-9).
        this.tokens.clear();
      }
      throw await toApiError(response);
    }
    return parseBody<T>(response);
  }

  /** Single network call with the bearer header of AUTH-8 when a token exists. */
  private fetchOnce(
    method: HttpMethod,
    path: string,
    body?: BodyInit,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (typeof body === 'string') {
      // FormData sets its own multipart boundary, so only JSON declares a type.
      headers['Content-Type'] = 'application/json';
    }
    const accessToken = this.tokens.getAccessToken();
    if (accessToken !== null) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return fetchOrThrow(`${this.baseUrl}${path}`, { method, headers, body });
  }

  /**
   * AUTH-7: exchanges the refresh token for a new pair; shared by concurrent 401s.
   * Resolves false once the tokens are cleared (no refresh token, or the API
   * answered 401/403); rejects with an ApiError for anything else (UI-26).
   */
  private refreshTokens(): Promise<boolean> {
    this.refreshing ??= this.exchangeRefreshToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async exchangeRefreshToken(): Promise<boolean> {
    const refreshToken = this.tokens.getRefreshToken();
    if (refreshToken === null) {
      this.tokens.clear();
      return false;
    }
    // A network failure rejects with status 0 and keeps the tokens (UI-26).
    const response = await fetchOrThrow(`${this.baseUrl}${REFRESH_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });
    if (response.status === 401 || response.status === 403) {
      // UI-26: the API rejected the refresh token; the session is over.
      this.tokens.clear();
      return false;
    }
    if (!response.ok) {
      // A 5xx or any other answer says nothing about the tokens (UI-26).
      throw await toApiError(response);
    }
    let auth: AuthResponse;
    try {
      auth = (await response.json()) as AuthResponse;
    } catch {
      // An unreadable 2xx body is the server's fault, not the session's.
      throw new ApiError(500, SERVER_ERROR_MESSAGE);
    }
    this.tokens.set(auth.accessToken, auth.refreshToken);
    return true;
  }
}

/** The client the endpoints and hooks use by default. */
export const apiClient = new ApiClient();

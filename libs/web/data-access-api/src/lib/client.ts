// SPEC.md §11.5 UI-17: a small `fetch` client, base URL from `VITE_API_BASE_URL`,
// tokens in localStorage, one automatic refresh on 401. SPEC.md §11.6: JSON in and
// out, errors shaped as `ApiErrorResponse` (`{ statusCode, message, error }`).
import type {
  ApiErrorResponse,
  AuthResponse,
} from '@rsn/shared/util-contracts';
import { TokenStore, tokenStore } from './tokens';

/** Base URL used when `VITE_API_BASE_URL` is not set (apps/api default port + §11.6 prefix). */
export const DEFAULT_API_BASE_URL = 'http://localhost:3000/api/v1';

/** `POST /auth/refresh` (AUTH-7); never retried, it is the retry. */
const REFRESH_PATH = '/auth/refresh';

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

/** Reads the `VITE_API_BASE_URL` of UI-17 and strips a trailing slash. */
function resolveBaseUrl(): string {
  const configured = import.meta.env?.VITE_API_BASE_URL;
  const base =
    configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** Turns a failed response into an ApiError, joining ValidationPipe message arrays. */
async function toApiError(response: Response): Promise<ApiError> {
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
 * (AUTH-7) before retrying; a failed exchange clears both tokens.
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

  /** One request plus, on 401, one refresh-and-retry (AUTH-7). */
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
    return fetch(`${this.baseUrl}${path}`, { method, headers, body });
  }

  /** AUTH-7: exchanges the refresh token for a new pair; shared by concurrent 401s. */
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
    try {
      const response = await fetch(`${this.baseUrl}${REFRESH_PATH}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        this.tokens.clear();
        return false;
      }
      const auth = (await response.json()) as AuthResponse;
      this.tokens.set(auth.accessToken, auth.refreshToken);
      return true;
    } catch {
      this.tokens.clear();
      return false;
    }
  }
}

/** The client the endpoints and hooks use by default. */
export const apiClient = new ApiClient();

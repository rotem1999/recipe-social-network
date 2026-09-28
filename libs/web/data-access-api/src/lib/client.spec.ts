import { afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ApiClient, ApiError, DEFAULT_API_BASE_URL } from './client';
import { TokenStore } from './tokens';

/** A fetch mock queue: each call shifts the next prepared response. */
let fetchMock: Mock;
let store: TokenStore;

interface ResponseInput {
  status?: number;
  statusText?: string;
  body?: string;
  headers?: Record<string, string>;
}

/** Minimal stand-in for the parts of `Response` the client reads. */
function makeResponse({
  status = 200,
  statusText = '',
  body = '',
  headers = {},
}: ResponseInput = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (name: string): string | null => headers[name.toLowerCase()] ?? null,
    },
    json: async () => JSON.parse(body) as unknown,
    text: async () => body,
  } as unknown as Response;
}

function jsonResponse(value: unknown, status = 200): Response {
  return makeResponse({
    status,
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
  });
}

/** AUTH-7: what `POST /auth/refresh` answers (`AuthResponse` of §11.6). */
function authResponse(accessToken: string, refreshToken: string): Response {
  return jsonResponse({
    accessToken,
    refreshToken,
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'rotem',
      email: null,
      favouriteCategories: [],
      createdAt: '2026-09-28T10:00:00.000Z',
    },
  });
}

function lastCall(index: number): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

function headersOf(index: number): Record<string, string> {
  return (lastCall(index)[1].headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  localStorage.clear();
  store = new TokenStore();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ApiClient (UI-17)', () => {
  it('UI-17 falls back to the default base URL when VITE_API_BASE_URL is not set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    const client = new ApiClient(store);
    await client.get('/health');

    expect(DEFAULT_API_BASE_URL).toBe('http://localhost:3000/api/v1');
    expect(client.baseUrl).toBe(DEFAULT_API_BASE_URL);
    expect(lastCall(0)[0]).toBe('http://localhost:3000/api/v1/health');
  });

  it('UI-17 takes the base URL from VITE_API_BASE_URL and strips trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:4200/api/v1/');
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    const client = new ApiClient(store);
    await client.get('/health');

    expect(client.baseUrl).toBe('http://localhost:4200/api/v1');
    expect(lastCall(0)[0]).toBe('http://localhost:4200/api/v1/health');
  });

  it('AUTH-8 sends the stored access token as a Bearer header', async () => {
    store.set('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'r1' }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    await client.get('/me');

    expect(headersOf(0)['Authorization']).toBe('Bearer access-1');
    expect(headersOf(0)['Accept']).toBe('application/json');
  });

  it('AUTH-8 sends no Authorization header when no token is stored', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    await client.get('/health');

    expect(headersOf(0)['Authorization']).toBeUndefined();
  });

  it('§11.6 sends a JSON body with the JSON content type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    await client.post('/auth/sign-in', { username: 'rotem', password: 'pw' });

    const [url, init] = lastCall(0);
    expect(url).toBe('http://localhost:3000/api/v1/auth/sign-in');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({ username: 'rotem', password: 'pw' }),
    );
    expect(headersOf(0)['Content-Type']).toBe('application/json');
  });

  it('UI-17 refreshes once on 401 and retries the original request', async () => {
    store.set('stale-access', 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 401 }))
      .mockResolvedValueOnce(authResponse('access-2', 'refresh-2'))
      .mockResolvedValueOnce(jsonResponse({ id: 'r1', title: 'Beef stew' }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const result = await client.get<{ id: string }>('/recipes/r1');

    expect(result).toEqual({ id: 'r1', title: 'Beef stew' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl, refreshInit] = lastCall(1);
    expect(refreshUrl).toBe('http://localhost:3000/api/v1/auth/refresh');
    expect(refreshInit.method).toBe('POST');
    expect(refreshInit.body).toBe(
      JSON.stringify({ refreshToken: 'refresh-1' }),
    );

    // AUTH-7: the new pair is stored and the retry carries the new token.
    expect(store.get()).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    expect(headersOf(2)['Authorization']).toBe('Bearer access-2');
    expect(lastCall(2)[0]).toBe('http://localhost:3000/api/v1/recipes/r1');
  });

  it('UI-17 clears both tokens and throws ApiError when the refresh is rejected', async () => {
    store.set('stale-access', 'stale-refresh');
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { statusCode: 401, message: 'Invalid refresh token', error: 'Unauthorized' },
          401,
        ),
      );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = await client.get('/me').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ accessToken: null, refreshToken: null });
  });

  it('AUTH-7 does not call the refresh route when no refresh token is stored', async () => {
    localStorage.setItem('cookbook.accessToken', 'stale-access');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401),
    );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = await client.get('/me').catch((cause: unknown) => cause);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((error as ApiError).status).toBe(401);
    expect(store.hasAccessToken()).toBe(false);
  });

  it('UI-17 retries only once: a second 401 clears the tokens and throws', async () => {
    store.set('stale-access', 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 401 }))
      .mockResolvedValueOnce(authResponse('access-2', 'refresh-2'))
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401),
      );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = await client.get('/me').catch((cause: unknown) => cause);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((error as ApiError).status).toBe(401);
    expect(store.get()).toEqual({ accessToken: null, refreshToken: null });
  });

  it('AUTH-7 never refreshes the refresh route itself', async () => {
    store.set('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401),
    );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    await client
      .post('/auth/refresh', { refreshToken: 'refresh-1' })
      .catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('§11.6 joins a ValidationPipe message array into one ApiError message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          statusCode: 400,
          message: ['servings must be at least 1', 'steps should not be empty'],
          error: 'Bad Request',
        },
        400,
      ),
    );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = (await client
      .post('/recipes', {})
      .catch((cause: unknown) => cause)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(400);
    expect(error.error).toBe('Bad Request');
    expect(error.message).toBe(
      'servings must be at least 1, steps should not be empty',
    );
  });

  it('§11.6 keeps a single-string error message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' },
        403,
      ),
    );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = (await client
      .get('/recipes/r1')
      .catch((cause: unknown) => cause)) as ApiError;

    expect(error.status).toBe(403);
    expect(error.message).toBe('Forbidden resource');
  });

  it('§11.6 falls back to the status text when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({ status: 502, statusText: 'Bad Gateway', body: '<html>' }),
    );

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const error = (await client
      .get('/health')
      .catch((cause: unknown) => cause)) as ApiError;

    expect(error.status).toBe(502);
    expect(error.message).toBe('Bad Gateway');
  });

  it('§11.6 resolves to undefined for a 204 answer', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ status: 204 }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');

    await expect(client.delete('/recipes/r1')).resolves.toBeUndefined();
  });

  it('IMG-3 uploads multipart without forcing a JSON content type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: [] }));

    const client = new ApiClient(store, 'http://localhost:3000/api/v1');
    const file = new File(['bytes'], 'stew.jpg', { type: 'image/jpeg' });
    await client.upload('/recipes/r1/images', file);

    const [url, init] = lastCall(0);
    expect(url).toBe('http://localhost:3000/api/v1/recipes/r1/images');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(headersOf(0)['Content-Type']).toBeUndefined();
  });
});

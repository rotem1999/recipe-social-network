import { afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { ApiClient } from './client';
import { createEndpoints } from './endpoints';
import type { Endpoints } from './endpoints';
import { TokenStore } from './tokens';

const BASE = 'http://localhost:3000/api/v1';

let fetchMock: Mock;
let api: Endpoints;

/** Minimal stand-in for the parts of `Response` the client reads. */
function jsonResponse(value: unknown): Response {
  const body = JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => JSON.parse(body) as unknown,
    text: async () => body,
  } as unknown as Response;
}

function call(index = 0): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
  vi.stubGlobal('fetch', fetchMock);
  api = createEndpoints(new ApiClient(new TokenStore(), BASE));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createEndpoints (§11.6)', () => {
  it('AUTH-5 signs in with POST auth/sign-in and the credentials body', async () => {
    await api.signIn({ username: 'rotem', password: 'correct horse' });

    const [url, init] = call();
    expect(url).toBe(`${BASE}/auth/sign-in`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({ username: 'rotem', password: 'correct horse' }),
    );
  });

  it('AUTH-8 reads the signed-in user with GET me', async () => {
    await api.me();

    const [url, init] = call();
    expect(url).toBe(`${BASE}/me`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('DISC-1 builds GET discover?category=Beef&page=2', async () => {
    await api.discover('Beef', 2);

    const [url, init] = call();
    expect(url).toBe(`${BASE}/discover?category=Beef&page=2`);
    expect(init.method).toBe('GET');
  });

  it('DISC-1 omits the query string when no category or page is given', async () => {
    await api.discover();

    expect(call()[0]).toBe(`${BASE}/discover`);
  });

  it('COM-2 votes with PUT comments/:id/vote and the { value } body', async () => {
    await api.vote('c-1', 1);

    const [url, init] = call();
    expect(url).toBe(`${BASE}/comments/c-1/vote`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ value: 1 }));
  });

  it('COM-2 clears a vote with value 0 on the same route', async () => {
    await api.vote('c-1', 0);

    expect(call()[1].body).toBe(JSON.stringify({ value: 0 }));
  });

  it('RATE-1 grades with PUT recipes/:id/rating and the { stars } body', async () => {
    await api.rate('r-1', 4);

    const [url, init] = call();
    expect(url).toBe(`${BASE}/recipes/r-1/rating`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ stars: 4 }));
  });

  it('IMG-3 uploads an image as multipart with the field name file', async () => {
    const file = new File(['bytes'], 'stew.jpg', { type: 'image/jpeg' });

    await api.uploadImage('r-1', file);

    const [url, init] = call();
    expect(url).toBe(`${BASE}/recipes/r-1/images`);
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect([...body.keys()]).toEqual(['file']);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('NUT-1 asks for nutrition with the mode in the query string', async () => {
    await api.getNutrition('r-1', 'meal');

    expect(call()[0]).toBe(`${BASE}/recipes/r-1/nutrition?mode=meal`);
  });

  it('COOK-1 asks the cook assistant with POST cook/ask', async () => {
    await api.cookAsk({
      recipeId: 'r-1',
      stepIndex: 0,
      question: 'Can I use butter instead?',
    });

    const [url, init] = call();
    expect(url).toBe(`${BASE}/cook/ask`);
    expect(init.method).toBe('POST');
  });

  it('COOK-8 reads the daily quota with GET cook/quota', async () => {
    await api.cookQuota();

    const [url, init] = call();
    expect(url).toBe(`${BASE}/cook/quota`);
    expect(init.method).toBe('GET');
  });

  it('REC-6 deletes a recipe with DELETE recipes/:id', async () => {
    await api.deleteRecipe('r-1');

    const [url, init] = call();
    expect(url).toBe(`${BASE}/recipes/r-1`);
    expect(init.method).toBe('DELETE');
  });

  it('SAVE-10 syncs a copy with POST recipes/:id/sync and no body', async () => {
    await api.syncRecipe('copy-1');

    const [url, init] = call();
    expect(url).toBe(`${BASE}/recipes/copy-1/sync`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('SAVE-10 percent-encodes the copy id in the sync route', async () => {
    await api.syncRecipe('copy/1 x');

    expect(call()[0]).toBe(`${BASE}/recipes/copy%2F1%20x/sync`);
  });

  it('§11.6 percent-encodes ids that reach a path segment', async () => {
    await api.cataloguePreview('52772/x y');

    expect(call()[0]).toBe(`${BASE}/discover/catalogue/52772%2Fx%20y`);
  });

  it('FR-3 searches users with the q parameter', async () => {
    await api.searchUsers('rot em');

    expect(call()[0]).toBe(`${BASE}/users/search?q=rot+em`);
  });
});

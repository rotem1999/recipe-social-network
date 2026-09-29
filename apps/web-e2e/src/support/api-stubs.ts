// Stubs for every §11.6 call the renderer makes, so apps/web-e2e needs no backend and
// no database (apps/web-e2e/CLAUDE.md). Nothing here is a real key, URL or provider
// payload: the bodies are the DTO shapes of `@rsn/shared/util-contracts`.
import type { Page, Route } from '@playwright/test';
import type {
  AuthResponse,
  DiscoverResponse,
  RecipeListResponse,
  RecommendResponse,
  UserDto,
} from '@rsn/shared/util-contracts';

/** Every API call of UI-17 goes through the §11.6 global prefix. */
export const API_GLOB = '**/api/v1/**';

/**
 * §3.3 (§16 M5): the attribution string TheMealDB's paid tier requires, returned by
 * `GET /discover` and shown in the Discover footer (UI-7).
 */
export const THEMEALDB_ATTRIBUTION =
  'Recipe data and imagery: TheMealDB (https://www.themealdb.com/)';

/** The signed-in user every stubbed response carries (UI-10 shows the username). */
export const FAKE_USER: UserDto = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-28T09:00:00.000Z',
};

/** AUTH-7: obviously fake token strings; the API is stubbed, nothing verifies them. */
export const FAKE_AUTH: AuthResponse = {
  accessToken: 'stub-access-token',
  refreshToken: 'stub-refresh-token',
  user: FAKE_USER,
};

/** SAVE-3: the caller owns and has saved nothing, so Home shows its empty state. */
export const EMPTY_RECIPES: RecipeListResponse = { recipes: [] };

/** WX-10: no picks and no weather — the card shows "No recommendation right now". */
export const EMPTY_RECOMMENDATION: RecommendResponse = {
  picks: [],
  weather: null,
  // COOK-8: the shared daily quota, reported with every AI answer.
  quota: { used: 0, limit: 100, remaining: 100 },
};

/** DISC-9: nothing published yet, but the attribution still ships (§3.3). */
export const EMPTY_DISCOVER: DiscoverResponse = {
  categories: [],
  attribution: THEMEALDB_ATTRIBUTION,
};

/**
 * The renderer runs on the preview origin and calls the API on another one, so every
 * fulfilled response carries the CORS headers the browser needs, and the preflight is
 * answered as well.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

/** Fulfils one route with a JSON body and the CORS headers above. */
export async function json(
  route: Route,
  body: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Answers a CORS preflight; returns true when the request was one. */
export async function handledPreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') {
    return false;
  }
  await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
  return true;
}

/** §11.6 error body (`{ statusCode, message, error }`), shown inline by UI-9. */
export async function apiError(
  route: Route,
  status: number,
  message: string,
  error: string,
): Promise<void> {
  await json(route, { statusCode: status, message, error }, status);
}

/** One intercepted §11.6 call, recorded by {@link stubAndRecord}. */
export interface RecordedCall {
  method: string;
  /** Path without the origin, e.g. `/api/v1/auth/sign-in`. */
  path: string;
  /** Parsed JSON request body, or null for a GET. */
  body: unknown;
}

/**
 * Records every API call the page makes and answers each one with `respond`, so a spec
 * can assert both what was sent (AUTH-5) and that nothing was sent at all (UI-9).
 */
export async function stubAndRecord(
  page: Page,
  calls: RecordedCall[],
  respond: (route: Route) => Promise<void>,
): Promise<void> {
  await page.route(API_GLOB, async (route) => {
    if (await handledPreflight(route)) {
      return;
    }
    const request = route.request();
    calls.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body: request.postDataJSON() as unknown,
    });
    await respond(route);
  });
}

/**
 * Routes every §11.6 call the signed-in shell makes (UI-16): sign-in, `GET /me`,
 * `GET /recipes`, `POST /recommend` and `GET /discover`. Anything else answers 404 so
 * an unstubbed call is visible instead of hanging.
 */
export async function stubSignedInApi(page: Page): Promise<void> {
  await page.route(API_GLOB, async (route) => {
    if (await handledPreflight(route)) {
      return;
    }
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith('/auth/sign-in') || path.endsWith('/auth/sign-up')) {
      await json(route, FAKE_AUTH);
      return;
    }
    if (path.endsWith('/me')) {
      await json(route, FAKE_USER);
      return;
    }
    if (path.endsWith('/recipes')) {
      await json(route, EMPTY_RECIPES);
      return;
    }
    if (path.endsWith('/recommend')) {
      await json(route, EMPTY_RECOMMENDATION);
      return;
    }
    if (path.endsWith('/discover')) {
      await json(route, EMPTY_DISCOVER);
      return;
    }
    if (path.endsWith('/friends')) {
      await json(route, { friends: [], incoming: [], outgoing: [] });
      return;
    }
    await apiError(route, 404, `No stub for ${path}`, 'Not Found');
  });
}

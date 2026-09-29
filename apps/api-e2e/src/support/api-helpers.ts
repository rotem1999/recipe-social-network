// Shared helpers for the api-e2e suites (SPEC.md §13 TEST-1). Everything here talks to
// a running API over HTTP through axios, whose base URL carries the §11.6 global prefix
// (see test-setup.ts). No database handle and no application module is imported: the
// suites exercise the deployed surface only.
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  AuthResponse,
  RecipeWriteRequest,
  UserDto,
} from '@rsn/shared/util-contracts';

/**
 * Lets a 4xx/5xx response through instead of throwing, so a spec can assert the exact
 * status of AUTH-8, REC-2 and FR-4 rejections. Happy paths keep the axios default, so
 * an unexpected non-2xx fails the test where it happens.
 */
export const allowErrors: AxiosRequestConfig = { validateStatus: () => true };

/** AUTH-5: passwords are 8–128 characters; this one is only ever used by the suite. */
export const TEST_PASSWORD = 'e2e-password-1';

/** Makes every run independent, per the "unique usernames per run" rule. */
let counter = 0;

/**
 * AUTH-5: 3–32 characters of `[a-z0-9_.-]`, unique per run. `Date.now()` keeps runs
 * apart, the counter keeps users inside one run apart.
 */
export function uniqueUsername(prefix = 'e2e'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}`.toLowerCase();
}

/** A signed-up user plus an axios instance that sends its access token (AUTH-8). */
export interface TestUser {
  id: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  user: UserDto;
  /** Every request carries `Authorization: Bearer <access token>` (AUTH-8). */
  client: AxiosInstance;
}

/** AUTH-8: an axios instance that authenticates as the holder of `accessToken`. */
export function clientFor(accessToken: string): AxiosInstance {
  return axios.create({
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** An axios instance that sends no token, for the AUTH-8 rejection cases. */
export function anonymousClient(): AxiosInstance {
  return axios.create();
}

/** AUTH-5: `POST /auth/sign-up` with a fresh username. */
export async function signUp(
  username: string = uniqueUsername(),
  password: string = TEST_PASSWORD,
  email?: string,
): Promise<TestUser> {
  const body =
    email === undefined
      ? { username, password }
      : { username, password, email };
  const response = await axios.post<AuthResponse>('/auth/sign-up', body);
  const auth = response.data;
  return {
    id: auth.user.id,
    username: auth.user.username,
    password,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user,
    client: clientFor(auth.accessToken),
  };
}

/**
 * §3.1.1: a complete recipe body — title, category from the 14 of DISC-7, servings,
 * ordered ingredients (one with an empty quantity, the "to taste" case) and ordered
 * steps (one with a cook-mode timer).
 */
export function recipeBody(
  overrides: Partial<RecipeWriteRequest> = {},
): RecipeWriteRequest {
  return {
    title: 'Spaghetti with tomato and basil',
    description: 'A weeknight pasta for two.',
    category: 'Pasta',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 12,
    ingredients: [
      { quantity: 200, unit: 'g', name: 'spaghetti' },
      { quantity: 400, unit: 'g', name: 'tomatoes', note: 'chopped' },
      { quantity: 2, unit: 'tbsp', name: 'olive oil' },
      { quantity: null, unit: 'none', name: 'salt', note: 'to taste' },
    ],
    steps: [
      { text: 'Bring a large pot of salted water to the boil.', durationMinutes: 8 },
      { text: 'Cook the spaghetti until al dente.', durationMinutes: 9 },
      { text: 'Toss with the tomatoes, the oil and the basil.' },
    ],
    ...overrides,
  };
}

// SPEC.md §11.5 UI-9: sign-in and sign-up are one screen with a segmented switch,
// fields per AUTH-5, errors inline under the form. No backend: every §11.6 call is
// answered by `page.route` (apps/web-e2e/CLAUDE.md).
import { expect, test } from '@playwright/test';
import type { Route } from '@playwright/test';
import { apiError, stubAndRecord } from './support/api-stubs';
import type { RecordedCall } from './support/api-stubs';

/** AUTH-5: passwords are 8–128 characters, so this one is one character short. */
const SHORT_PASSWORD = 'short7c';
/** AUTH-5: long enough to pass the form and reach the network. */
const GOOD_PASSWORD = 'e2e-password-1';

/** AUTH-5: the same 401 for an unknown user and for a wrong password. */
const wrongCredentials = (route: Route): Promise<void> =>
  apiError(route, 401, 'Invalid username or password', 'Unauthorized');

/** Any call at all fails the test that installed it; see the two form-only specs. */
const shouldNotBeCalled = (route: Route): Promise<void> =>
  apiError(route, 500, 'The form should not have called the API', 'Internal Server Error');

test.describe('UI-9 auth screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('UI-9 shows the CookBook heading and the Sign in / Sign up switch', async ({
    page,
  }) => {
    // UI-2: the app is branded CookBook everywhere.
    await expect(
      page.getByRole('heading', { level: 1, name: 'CookBook' }),
    ).toBeVisible();

    const segmented = page.locator('.seg');
    await expect(segmented.getByText('Sign in', { exact: true })).toBeVisible();
    await expect(segmented.getByText('Sign up', { exact: true })).toBeVisible();
    // UI-9: the screen opens on the sign-in half.
    await expect(segmented.locator('input[value="sign-in"]')).toBeChecked();

    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    // AUTH-5: the optional email belongs to sign-up only.
    await expect(page.getByLabel('Email (optional)')).toHaveCount(0);
  });

  test('UI-9 switches to sign-up, which adds the optional email of AUTH-5', async ({
    page,
  }) => {
    const segmented = page.locator('.seg');
    await segmented.getByText('Sign up', { exact: true }).click();

    await expect(segmented.locator('input[value="sign-up"]')).toBeChecked();
    await expect(page.getByLabel('Email (optional)')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create account' }),
    ).toBeVisible();
  });

  test('AUTH-5 sends the username lower-cased and shows the API message inline', async ({
    page,
  }) => {
    const calls: RecordedCall[] = [];
    await stubAndRecord(page, calls, wrongCredentials);

    await page.getByLabel('Username').fill('ROTEM');
    await page.getByLabel('Password').fill(GOOD_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // UI-9: the API's own message, inline under the form.
    await expect(page.getByRole('alert')).toHaveText(
      'Invalid username or password',
    );

    // AUTH-5: the username is stored lower-case, so it is sent lower-case.
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toMatch(/\/api\/v1\/auth\/sign-in$/);
    expect(calls[0].body).toEqual({
      username: 'rotem',
      password: GOOD_PASSWORD,
    });
  });

  test('AUTH-5 rejects a password under 8 characters inline, without a network call', async ({
    page,
  }) => {
    const calls: RecordedCall[] = [];
    await stubAndRecord(page, calls, shouldNotBeCalled);

    await page.getByLabel('Username').fill('rotem');
    await page.getByLabel('Password').fill(SHORT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Use at least 8 characters.',
    );
    // UI-9: the form answers on its own; `/auth/sign-in` is never hit.
    expect(calls).toEqual([]);
  });

  test('AUTH-5 rejects a username outside [a-z0-9_.-]{3,32} inline', async ({
    page,
  }) => {
    const calls: RecordedCall[] = [];
    await stubAndRecord(page, calls, shouldNotBeCalled);

    await page.getByLabel('Username').fill('no spaces allowed');
    await page.getByLabel('Password').fill(GOOD_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText(
      'Use 3 to 32 characters: letters, numbers, underscore, dot or hyphen.',
    );
    expect(calls).toEqual([]);
  });
});

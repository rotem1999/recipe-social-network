// SPEC.md §11.5 UI-16: navigation is in-app state (no URL router) — after signing in the
// NavBar switches between Home, Discover and Friends. Every §11.6 call is stubbed with
// `page.route`, so the suite needs no backend and no database.
import { expect, test } from '@playwright/test';
import {
  FAKE_USER,
  THEMEALDB_ATTRIBUTION,
  stubSignedInApi,
} from './support/api-stubs';

/** AUTH-5: any valid pair; the stubbed API accepts whatever the form sends. */
const PASSWORD = 'e2e-password-1';

test.describe('UI-16 signed-in shell', () => {
  test.beforeEach(async ({ page }) => {
    await stubSignedInApi(page);
    await page.goto('/');

    await page.getByLabel('Username').fill(FAKE_USER.username);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  });

  test('UI-16 shows the NavBar with Home, Discover and Friends after sign-in', async ({
    page,
  }) => {
    const nav = page.getByRole('banner');

    await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Discover' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Friends' })).toBeVisible();
    // UI-11: "New recipe" opens the full editor.
    await expect(nav.getByRole('button', { name: 'New recipe' })).toBeVisible();
    // UI-9: the avatar initial is the first letter of the username.
    await expect(
      nav.getByRole('button', { name: `Account menu for ${FAKE_USER.username}` }),
    ).toHaveText('R');
    // UI-16: navigation is in-app state, so the URL never leaves the root.
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('SAVE-3 shows the Home empty state when GET /recipes returns nothing', async ({
    page,
  }) => {
    // UI-10: "Good morning/afternoon/evening, <username>" from the local hour.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(
        `^Good (morning|afternoon|evening), ${FAKE_USER.username}$`,
      ),
    );
    await expect(
      page.getByText(
        'No recipes yet. Create one, or save a public recipe from Discover.',
      ),
    ).toBeVisible();
  });

  test('WX-10 shows "No recommendation right now" when POST /recommend returns no picks', async ({
    page,
  }) => {
    await expect(page.getByText('No recommendation right now')).toBeVisible();
  });

  test('UI-16 opens Discover from the NavBar, which calls GET /discover', async ({
    page,
  }) => {
    const discoverCall = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/api/v1/discover'),
    );

    await page.getByRole('banner').getByRole('button', { name: 'Discover' }).click();
    await discoverCall;

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Discover',
    );
    // DISC-1: nothing is published in the stubbed feed.
    await expect(page.getByText('Nothing has been published yet.')).toBeVisible();
    // §3.3 / UI-7: the attribution string ships with its URL wherever TheMealDB shows.
    await expect(page.getByText(THEMEALDB_ATTRIBUTION)).toBeVisible();
  });

  test('UI-16 goes back to Home from Discover without a URL change', async ({
    page,
  }) => {
    const nav = page.getByRole('banner');

    await nav.getByRole('button', { name: 'Discover' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Discover',
    );

    await nav.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      new RegExp(
        `^Good (morning|afternoon|evening), ${FAKE_USER.username}$`,
      ),
    );
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

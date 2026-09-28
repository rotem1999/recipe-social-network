// SPEC.md §13 TEST-2 (Electron end-to-end with @wdio/electron-service 10.3) against the
// unpackaged electron-vite build of apps/desktop: the CookBook window (UI-2, §11.2.2),
// the preload timezone bridge (WX-8, WX-9) and the auth screen the renderer opens on
// when no token is stored (UI-9). The API is not running, so nothing here calls it.

/** WX-9: an IANA zone is `Area/Location`, e.g. `Asia/Jerusalem`; the API reads the city
 * segment after the `/`. */
const IANA_ZONE = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/;

describe('CookBook desktop shell', () => {
  it('UI-2 titles the window CookBook', async () => {
    await expect(browser).toHaveTitle('CookBook');
  });

  it('§11.2.2 opens exactly one window', async () => {
    const handles = await browser.getWindowHandles();

    expect(handles).toHaveLength(1);
  });

  it('WX-9 exposes the machine IANA timezone through the preload bridge', async () => {
    const timezone = await browser.execute(() => window.cookbook?.timezone);

    expect(typeof timezone).toBe('string');
    expect(timezone).toContain('/');
    expect(timezone).toMatch(IANA_ZONE);
  });

  it('IMG-2 keeps the renderer free of the Firebase and OpenRouter SDKs', async () => {
    // §11.3: the desktop app holds no provider SDK and no key; only the bridge is exposed.
    const exposed = await browser.execute(() =>
      Object.keys(window.cookbook ?? {}),
    );

    expect(exposed).toEqual(['timezone']);
  });

  it('UI-9 shows the CookBook auth screen while no token is stored', async () => {
    const heading = await browser.$('h1');

    await expect(heading).toBeDisplayed();
    await expect(heading).toHaveText('CookBook');
  });

  it('UI-9 shows the Sign in / Sign up switch of the auth screen', async () => {
    const segmented = await browser.$('.seg');
    await expect(segmented).toBeDisplayed();

    const labels = await segmented.getText();
    expect(labels).toContain('Sign in');
    expect(labels).toContain('Sign up');
  });
});

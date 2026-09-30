// SPEC §11.7 DOC-7 (and TEST-3): who may open the API docs.
import * as crypto from 'node:crypto';
import {
  DOCS_WWW_AUTHENTICATE,
  MIN_DOCS_PASSWORD_LENGTH,
  createDocsBasicAuth,
  isAuthorized,
  resolveDocsAccess,
} from './docs-access';
import type { DocsCredentials, DocsResponse } from './docs-access';

/**
 * The constant-time check of DOC-7 goes through `timingSafeEqual`; the real function runs,
 * the wrapper only records what it was given.
 */
jest.mock('node:crypto', () => {
  const actual =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const timingSafeEqual = crypto.timingSafeEqual as jest.MockedFunction<
  typeof crypto.timingSafeEqual
>;

/** Made-up credentials, used by this suite only (DOC-9: no real secret in a test). */
const USERNAME = 'docs-reader';
const PASSWORD = 'made-up-docs-pass-0123';
const CREDENTIALS: DocsCredentials = { username: USERNAME, password: PASSWORD };

function basic(pair: string): string {
  return `Basic ${Buffer.from(pair, 'utf8').toString('base64')}`;
}

describe('resolveDocsAccess', () => {
  it.each([['development'], ['test'], [''], [undefined]])(
    'DOC-7 is open when NODE_ENV is %p (not production)',
    (nodeEnv) => {
      expect(resolveDocsAccess({ NODE_ENV: nodeEnv })).toEqual({
        mode: 'open',
      });
    },
  );

  it('DOC-7 is open in development even with no docs keys and a short password', () => {
    expect(
      resolveDocsAccess({
        NODE_ENV: 'development',
        DOCS_USERNAME: '',
        DOCS_PASSWORD: 'short',
      }),
    ).toEqual({ mode: 'open' });
  });

  it('DOC-7 puts Basic auth in front of the docs in production with valid keys', () => {
    expect(
      resolveDocsAccess({
        NODE_ENV: 'production',
        DOCS_USERNAME: USERNAME,
        DOCS_PASSWORD: PASSWORD,
      }),
    ).toEqual({ mode: 'basic', credentials: CREDENTIALS });
  });

  it('DOC-7 requires a password of at least 16 characters', () => {
    expect(MIN_DOCS_PASSWORD_LENGTH).toBe(16);
  });

  it('DOC-7 accepts a password of exactly 16 characters', () => {
    const password = 'p'.repeat(16);

    expect(
      resolveDocsAccess({
        NODE_ENV: 'production',
        DOCS_USERNAME: USERNAME,
        DOCS_PASSWORD: password,
      }),
    ).toEqual({ mode: 'basic', credentials: { username: USERNAME, password } });
  });

  it('DOC-7 disables the docs for a 15-character password and names DOCS_PASSWORD, not its value', () => {
    const password = 'q'.repeat(15);

    const access = resolveDocsAccess({
      NODE_ENV: 'production',
      DOCS_USERNAME: USERNAME,
      DOCS_PASSWORD: password,
    });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).toContain('DOCS_PASSWORD');
    expect(access.warning).not.toContain(password);
    expect(access.warning).not.toContain(USERNAME);
  });

  it('DOC-7 disables the docs for an empty username and names DOCS_USERNAME only', () => {
    const access = resolveDocsAccess({
      NODE_ENV: 'production',
      DOCS_USERNAME: '',
      DOCS_PASSWORD: PASSWORD,
    });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).toContain('DOCS_USERNAME');
    expect(access.warning).not.toContain('DOCS_PASSWORD');
    expect(access.warning).not.toContain(PASSWORD);
  });

  it('DOC-7 disables the docs for an empty password and names DOCS_PASSWORD only', () => {
    const access = resolveDocsAccess({
      NODE_ENV: 'production',
      DOCS_USERNAME: USERNAME,
      DOCS_PASSWORD: '',
    });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).toContain('DOCS_PASSWORD');
    expect(access.warning).not.toContain('DOCS_USERNAME');
    expect(access.warning).not.toContain(USERNAME);
  });

  it('DOC-7 disables the docs when both keys are empty and names both', () => {
    const access = resolveDocsAccess({
      NODE_ENV: 'production',
      DOCS_USERNAME: '',
      DOCS_PASSWORD: '',
    });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).toContain('DOCS_USERNAME');
    expect(access.warning).toContain('DOCS_PASSWORD');
  });

  it('DOC-7 disables the docs when both keys are missing from the environment', () => {
    const access = resolveDocsAccess({ NODE_ENV: 'production' });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).toContain('DOCS_USERNAME');
    expect(access.warning).toContain('DOCS_PASSWORD');
  });

  it('DOC-7 names the empty key but never the value of the other key', () => {
    const access = resolveDocsAccess({
      NODE_ENV: 'production',
      DOCS_USERNAME: USERNAME,
      DOCS_PASSWORD: '',
    });

    expect(access.mode).toBe('disabled');
    if (access.mode !== 'disabled') return;
    expect(access.warning).not.toContain(USERNAME);
  });
});

describe('isAuthorized', () => {
  beforeEach(() => {
    timingSafeEqual.mockClear();
  });

  it('DOC-7 rejects a missing Authorization header', () => {
    expect(isAuthorized(undefined, CREDENTIALS)).toBe(false);
  });

  it('DOC-7 rejects an empty Authorization header', () => {
    expect(isAuthorized('', CREDENTIALS)).toBe(false);
  });

  it('DOC-7 rejects a non-Basic scheme such as a Bearer token', () => {
    expect(isAuthorized(`Bearer ${PASSWORD}`, CREDENTIALS)).toBe(false);
  });

  it('DOC-7 rejects a Basic header whose payload is not base64', () => {
    expect(isAuthorized('Basic not*base64!', CREDENTIALS)).toBe(false);
    expect(isAuthorized('Basic ', CREDENTIALS)).toBe(false);
  });

  it('DOC-7 rejects a decoded payload with no colon', () => {
    expect(isAuthorized(basic(`${USERNAME}${PASSWORD}`), CREDENTIALS)).toBe(
      false,
    );
  });

  it('DOC-7 rejects a user-id with no colon and no password (§16 A11)', () => {
    expect(isAuthorized(basic(USERNAME), CREDENTIALS)).toBe(false);
  });

  it('DOC-7 rejects the wrong username with the right password', () => {
    expect(isAuthorized(basic(`someone-else:${PASSWORD}`), CREDENTIALS)).toBe(
      false,
    );
  });

  it('DOC-7 rejects the right username with the wrong password', () => {
    expect(
      isAuthorized(basic(`${USERNAME}:made-up-wrong-pass-0123`), CREDENTIALS),
    ).toBe(false);
  });

  it('DOC-7 rejects a password that is a prefix or an extension of the right one', () => {
    expect(
      isAuthorized(basic(`${USERNAME}:${PASSWORD.slice(0, -1)}`), CREDENTIALS),
    ).toBe(false);
    expect(isAuthorized(basic(`${USERNAME}:${PASSWORD}x`), CREDENTIALS)).toBe(
      false,
    );
    expect(isAuthorized(basic(`${USERNAME}:`), CREDENTIALS)).toBe(false);
  });

  it('DOC-7 accepts the right pair', () => {
    expect(isAuthorized(basic(`${USERNAME}:${PASSWORD}`), CREDENTIALS)).toBe(
      true,
    );
  });

  it('DOC-7 splits user:password at the first colon, so the password may contain colons (§16 A11)', () => {
    const credentials = {
      username: USERNAME,
      password: 'made:up:docs:pass:0123',
    };

    expect(
      isAuthorized(basic(`${USERNAME}:${credentials.password}`), credentials),
    ).toBe(true);
    expect(
      isAuthorized(basic(`${USERNAME}:made:up:docs:pass`), credentials),
    ).toBe(false);
  });

  it('DOC-7 compares both halves in constant time over 32-byte SHA-256 digests, whatever their lengths', () => {
    isAuthorized(basic(`x:${PASSWORD}${PASSWORD}`), CREDENTIALS);

    // Both halves are compared even though the username already failed.
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [given, expected] of timingSafeEqual.mock.calls) {
      expect((given as Buffer).length).toBe(32);
      expect((expected as Buffer).length).toBe(32);
    }
  });

  it('DOC-7 compares the digests of the given and the configured values', () => {
    isAuthorized(basic(`${USERNAME}:${PASSWORD}`), CREDENTIALS);

    const sha256 = (value: string): Buffer =>
      crypto.createHash('sha256').update(value, 'utf8').digest();
    expect(timingSafeEqual.mock.calls).toEqual([
      [sha256(USERNAME), sha256(USERNAME)],
      [sha256(PASSWORD), sha256(PASSWORD)],
    ]);
  });

  it('DOC-7 checks the one Authorization value it is handed, the first of a list (§16 A12)', () => {
    expect(
      isAuthorized(
        [basic(`${USERNAME}:${PASSWORD}`), 'Basic eA=='],
        CREDENTIALS,
      ),
    ).toBe(true);
    expect(
      isAuthorized(
        ['Basic eA==', basic(`${USERNAME}:${PASSWORD}`)],
        CREDENTIALS,
      ),
    ).toBe(false);
  });

  it.each([['basic'], ['BASIC'], ['bAsIc']])(
    'DOC-7 matches the scheme name Basic in any letter case: %s (§16 A10)',
    (scheme) => {
      const header = basic(`${USERNAME}:${PASSWORD}`).replace('Basic', scheme);

      expect(isAuthorized(header, CREDENTIALS)).toBe(true);
    },
  );

  it('DOC-7 still rejects wrong credentials under a lower-case scheme name (§16 A10)', () => {
    const header = basic(`${USERNAME}:made-up-wrong-pass-0123`).replace(
      'Basic',
      'basic',
    );

    expect(isAuthorized(header, CREDENTIALS)).toBe(false);
  });
});

describe('createDocsBasicAuth', () => {
  function fakeResponse(): DocsResponse & {
    setHeader: jest.Mock;
    end: jest.Mock;
  } {
    return { statusCode: 200, setHeader: jest.fn(), end: jest.fn() };
  }

  it('DOC-7 uses the exact CookBook challenge', () => {
    expect(DOCS_WWW_AUTHENTICATE).toBe(
      'Basic realm="CookBook API docs", charset="UTF-8"',
    );
  });

  it.each([
    ['no Authorization header', {}],
    ['a Bearer token', { authorization: 'Bearer some-access-token' }],
    [
      'a wrong password',
      { authorization: basic(`${USERNAME}:made-up-wrong-pass-0123`) },
    ],
  ])(
    'DOC-7 answers 401 with the challenge and an empty body for %s',
    (_label, headers: Record<string, string>) => {
      const middleware = createDocsBasicAuth(CREDENTIALS);
      const response = fakeResponse();
      const next = jest.fn();

      middleware({ headers }, response, next);

      expect(response.statusCode).toBe(401);
      expect(response.setHeader).toHaveBeenCalledTimes(1);
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="CookBook API docs", charset="UTF-8"',
      );
      expect(response.end).toHaveBeenCalledTimes(1);
      expect(response.end).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalled();
    },
  );

  it('DOC-7 calls next() and leaves the response alone for the right credentials', () => {
    const middleware = createDocsBasicAuth(CREDENTIALS);
    const response = fakeResponse();
    const next = jest.fn();

    middleware(
      { headers: { authorization: basic(`${USERNAME}:${PASSWORD}`) } },
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });
});

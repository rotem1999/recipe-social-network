// SPEC §11.7 DOC-7: who may open the API docs. Development is open; production puts
// HTTP Basic auth in front of every docs path, or does not mount the docs at all.
import { createHash, timingSafeEqual } from 'node:crypto';
import { isProduction } from './docs-options';

/** DOC-7: the production docs password is at least this long. */
export const MIN_DOCS_PASSWORD_LENGTH = 16;

/** DOC-7: the challenge sent with every 401. */
export const DOCS_WWW_AUTHENTICATE =
  'Basic realm="CookBook API docs", charset="UTF-8"';

/** The §14 keys DOC-7 reads. */
export interface DocsEnv {
  NODE_ENV?: string;
  DOCS_USERNAME?: string;
  DOCS_PASSWORD?: string;
}

export interface DocsCredentials {
  username: string;
  password: string;
}

/**
 * DOC-7: `open` in development; `basic` in production with valid keys; `disabled` in
 * production when a key is empty or the password is too short. `warning` names the
 * key, never its value.
 */
export type DocsAccess =
  | { mode: 'open' }
  | { mode: 'basic'; credentials: DocsCredentials }
  | { mode: 'disabled'; warning: string };

export function resolveDocsAccess(env: DocsEnv): DocsAccess {
  if (!isProduction(env.NODE_ENV)) {
    return { mode: 'open' };
  }
  const username = env.DOCS_USERNAME ?? '';
  const password = env.DOCS_PASSWORD ?? '';
  const empty = [
    username === '' ? 'DOCS_USERNAME' : null,
    password === '' ? 'DOCS_PASSWORD' : null,
  ].filter((key): key is string => key !== null);
  if (empty.length > 0) {
    return {
      mode: 'disabled',
      warning: `API docs are not served: ${empty.join(' and ')} ${
        empty.length > 1 ? 'are' : 'is'
      } empty (DOC-7).`,
    };
  }
  if (password.length < MIN_DOCS_PASSWORD_LENGTH) {
    return {
      mode: 'disabled',
      warning: `API docs are not served: DOCS_PASSWORD is shorter than ${MIN_DOCS_PASSWORD_LENGTH} characters (DOC-7).`,
    };
  }
  return { mode: 'basic', credentials: { username, password } };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** DOC-7: constant time over the SHA-256 digests, so a length difference leaks nothing. */
function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(sha256(given), sha256(expected));
}

/**
 * DOC-7: true only for `Authorization: Basic <base64(username:password)>` carrying the
 * configured pair. Both halves are always compared, whatever the first one gave.
 */
export function isAuthorized(
  authorization: string | string[] | undefined,
  expected: DocsCredentials,
): boolean {
  const header = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  if (typeof header !== 'string') return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header.trim());
  if (match === null) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator < 0) return false;
  const usernameMatches = sameSecret(
    decoded.slice(0, separator),
    expected.username,
  );
  const passwordMatches = sameSecret(
    decoded.slice(separator + 1),
    expected.password,
  );
  return usernameMatches && passwordMatches;
}

/** The parts of an Express request and response the check uses. */
export interface DocsRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface DocsResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

export type DocsMiddleware = (
  request: DocsRequest,
  response: DocsResponse,
  next: () => void,
) => void;

/** DOC-7: lets the right credentials through; anything else gets 401 and the challenge. */
export function createDocsBasicAuth(expected: DocsCredentials): DocsMiddleware {
  return (request, response, next) => {
    if (isAuthorized(request.headers['authorization'], expected)) {
      next();
      return;
    }
    response.statusCode = 401;
    response.setHeader('WWW-Authenticate', DOCS_WWW_AUTHENTICATE);
    response.end();
  };
}

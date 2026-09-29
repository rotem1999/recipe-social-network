/** AUTH-5: usernames and emails are trimmed and stored lower-case. */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** AUTH-5: optional email, unique when present, stored lower-case. */
export function normaliseEmail(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Escapes the Postgres `LIKE`/`ILIKE` wildcards so a username containing `_`
 * (allowed by AUTH-5) is matched literally in the FR-4 prefix search.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

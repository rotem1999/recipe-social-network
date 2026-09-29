import type { JwtSignOptions } from '@nestjs/jwt';

/**
 * `@nestjs/jwt` types `expiresIn` with the `ms` template-literal union, while the
 * TTLs come from the environment as plain strings (`JWT_ACCESS_TTL`, AUTH-7).
 */
export type TokenTtl = NonNullable<JwtSignOptions['expiresIn']>;

export function asTtl(value: string): TokenTtl {
  return value as TokenTtl;
}

import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/** AUTH-6: cost parameters of every hash this service writes. */
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
/**
 * AUTH-6: N=2^17 with r=8 needs about 128 * N * r = 128 MiB; Node's default
 * `maxmem` is 32 MiB and would reject the call, so it is raised to 256 MiB.
 */
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

/** AUTH-6: `scrypt$N$r$p$<salt b64>$<key b64>`. */
const PREFIX = 'scrypt';
const FIELD_COUNT = 6;

/**
 * AUTH-6: fixed hash that a sign-in for an unknown username is verified against, so it
 * runs the same scrypt derivation (same N, r, p and key length) as a wrong password.
 * Salt and key are random bytes, not derived from any password.
 */
export const DUMMY_PASSWORD_HASH = [
  PREFIX,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  'OBqyS6Kt19MYrggVFrIChw==',
  'E9zdqOKived6Y7a8DqsGBTF5xQHmpq1tNOLfW2wR34CiIkCWYsVvQWKrddxI7COeWCfhNlGh+vQDuanRtbpGWw==',
].join('$');

const scryptAsync = promisify(scrypt) as unknown as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Parsed form of a stored hash, or `null` when the stored value is not ours. */
interface StoredHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parsePositiveInt(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * AUTH-6: strict parser, so a stored value in any other format (bcrypt, plain
 * text, an empty column) can only ever make `verify` return false.
 */
function parseStored(stored: string): StoredHash | null {
  const parts = stored.split('$');
  if (parts.length !== FIELD_COUNT) return null;
  const [prefix, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  if (prefix !== PREFIX) return null;

  const n = parsePositiveInt(rawN);
  const r = parsePositiveInt(rawR);
  const p = parsePositiveInt(rawP);
  if (n === null || r === null || p === null) return null;

  const salt = Buffer.from(rawSalt, 'base64');
  const key = Buffer.from(rawKey, 'base64');
  // Buffer.from silently drops invalid base64, so re-encoding must round-trip.
  if (salt.length === 0 || key.length === 0) return null;
  if (
    salt.toString('base64') !== rawSalt ||
    key.toString('base64') !== rawKey
  ) {
    return null;
  }
  return { n, r, p, salt, key };
}

/** AUTH-6: the only place a password is turned into, or checked against, a hash. */
@Injectable()
export class PasswordService {
  /** AUTH-6: 16-byte random salt, 64-byte key, N=2^17, r=8, p=1. */
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await scryptAsync(password, salt, KEY_BYTES, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    });
    return [
      PREFIX,
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  /**
   * AUTH-6: constant-time comparison with `timingSafeEqual`. The cost parameters
   * are read back from the stored value so older hashes keep verifying; anything
   * that does not parse, or that scrypt refuses to derive, verifies false.
   */
  async verify(password: string, stored: string): Promise<boolean> {
    const parsed = parseStored(stored);
    if (parsed === null) return false;

    let derived: Buffer;
    try {
      derived = await scryptAsync(password, parsed.salt, parsed.key.length, {
        N: parsed.n,
        r: parsed.r,
        p: parsed.p,
        maxmem: SCRYPT_MAXMEM,
      });
    } catch {
      return false;
    }
    if (derived.length !== parsed.key.length) return false;
    return timingSafeEqual(derived, parsed.key);
  }
}

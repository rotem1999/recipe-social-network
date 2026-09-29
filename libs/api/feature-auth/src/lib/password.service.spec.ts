// AUTH-6: scrypt hashing and constant-time verification.
import { PasswordService } from './password.service';

/** AUTH-6 uses N=2^17, so a single hash costs real CPU time. */
jest.setTimeout(60_000);

describe('AUTH-6 PasswordService', () => {
  const service = new PasswordService();
  const PASSWORD = 'correct horse battery';

  it('AUTH-6 writes scrypt$131072$8$1$<salt b64>$<key b64> with a 16-byte salt and a 64-byte key', async () => {
    const stored = await service.hash(PASSWORD);
    const parts = stored.split('$');

    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('131072');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
    expect(Buffer.from(parts[4], 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5], 'base64')).toHaveLength(64);
    expect(stored).toMatch(/^scrypt\$131072\$8\$1\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/);
  });

  it('AUTH-6 verifies the password it hashed', async () => {
    const stored = await service.hash(PASSWORD);

    await expect(service.verify(PASSWORD, stored)).resolves.toBe(true);
  });

  it('AUTH-6 rejects a wrong password against a real hash', async () => {
    const stored = await service.hash(PASSWORD);

    await expect(service.verify('correct horse batteryx', stored)).resolves.toBe(false);
    await expect(service.verify('', stored)).resolves.toBe(false);
  });

  it('AUTH-6 rejects a tampered key, a tampered salt and tampered cost parameters', async () => {
    const stored = await service.hash(PASSWORD);
    const [prefix, n, r, p, salt, key] = stored.split('$');

    // One changed base64 character inside the key: still a well-formed hash, wrong bytes.
    const flipped = `${key.slice(0, 10)}${key[10] === 'A' ? 'B' : 'A'}${key.slice(11)}`;
    expect(flipped).not.toBe(key);
    const tamperedKey = [prefix, n, r, p, salt, flipped].join('$');
    const tamperedSalt = [
      prefix,
      n,
      r,
      p,
      Buffer.from('0123456789abcdef').toString('base64'),
      key,
    ].join('$');
    const tamperedCost = [prefix, '16384', r, p, salt, key].join('$');

    await expect(service.verify(PASSWORD, tamperedKey)).resolves.toBe(false);
    await expect(service.verify(PASSWORD, tamperedSalt)).resolves.toBe(false);
    await expect(service.verify(PASSWORD, tamperedCost)).resolves.toBe(false);
  });

  it.each([
    ['empty column', ''],
    ['plain text', PASSWORD],
    ['bcrypt', '$2b$12$abcdefghijklmnopqrstuv'],
    ['wrong prefix', 'pbkdf2$131072$8$1$c2FsdA==$a2V5'],
    ['too few fields', 'scrypt$131072$8$1$c2FsdA=='],
    ['too many fields', 'scrypt$131072$8$1$c2FsdA==$a2V5$extra'],
    ['non-numeric cost', 'scrypt$N$8$1$c2FsdA==$a2V5'],
    ['zero cost', 'scrypt$0$8$1$c2FsdA==$a2V5'],
    ['empty salt', 'scrypt$131072$8$1$$a2V5'],
    ['non-base64 salt', 'scrypt$131072$8$1$not base64!$a2V5'],
  ])('AUTH-6 verifies false against a foreign format (%s)', async (_name, stored) => {
    await expect(service.verify(PASSWORD, stored)).resolves.toBe(false);
  });

  it('AUTH-6 gives two different hashes for the same password (random salt)', async () => {
    const first = await service.hash(PASSWORD);
    const second = await service.hash(PASSWORD);

    expect(first).not.toBe(second);
    expect(first.split('$')[4]).not.toBe(second.split('$')[4]);
    // Both still verify: only the salt differs.
    await expect(service.verify(PASSWORD, first)).resolves.toBe(true);
    await expect(service.verify(PASSWORD, second)).resolves.toBe(true);
  });
});

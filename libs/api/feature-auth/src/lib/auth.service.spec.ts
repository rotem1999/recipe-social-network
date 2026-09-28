// AUTH-5, AUTH-6, AUTH-7: sign-up, sign-in and refresh.
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { UserEntity } from '@rsn/api/data-access-db';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import type { UsersService } from './users.service';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. These
 * tests use plain constructor injection, so those packages are replaced at their module
 * boundary by the decorators and module helpers the files under test touch when loaded.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
  getRepositoryToken: (entity: { name: string }) => `${entity.name}Repository`,
  TypeOrmModule: {
    forRoot: () => ({}),
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
  JwtModule: { register: () => ({}), registerAsync: () => ({}) },
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const CREATED_AT = new Date('2026-09-28T10:00:00.000Z');

function userRow(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    username: 'rotem',
    email: 'rotem@example.com',
    passwordHash: 'scrypt$131072$8$1$c2FsdHNhbHRzYWx0c2E=$a2V5',
    favouriteCategories: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  } as UserEntity;
}

interface Harness {
  service: AuthService;
  users: {
    findById: jest.Mock;
    findByUsername: jest.Mock;
    findByEmail: jest.Mock;
    create: jest.Mock;
    toDto: jest.Mock;
  };
  passwords: { hash: jest.Mock; verify: jest.Mock };
  jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  config: { get: jest.Mock };
}

function harness(env: Record<string, string> = {}): Harness {
  const users = {
    findById: jest.fn(),
    findByUsername: jest.fn().mockResolvedValue(null),
    findByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    toDto: jest.fn((user: UserEntity) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      favouriteCategories: user.favouriteCategories,
      createdAt: user.createdAt.toISOString(),
    })),
  };
  const passwords = {
    hash: jest.fn().mockResolvedValue('scrypt$131072$8$1$c2FsdA==$a2V5'),
    verify: jest.fn().mockResolvedValue(true),
  };
  const jwt = {
    // AUTH-7: the first call of a pair is the access token, the second the refresh token.
    signAsync: jest
      .fn()
      .mockResolvedValueOnce('access.jwt')
      .mockResolvedValueOnce('refresh.jwt'),
    verifyAsync: jest.fn(),
  };
  const values: Record<string, string> = {
    JWT_REFRESH_SECRET: 'refresh-secret-for-tests',
    ...env,
  };
  const config = { get: jest.fn((key: string) => values[key]) };

  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  return { service, users, passwords, jwt, config };
}

/** Narrows the rejection of a call that must fail, so its status can be asserted. */
async function failureOf(promise: Promise<unknown>): Promise<UnauthorizedException> {
  try {
    await promise;
  } catch (error) {
    return error as UnauthorizedException;
  }
  throw new Error('the call was expected to reject');
}

describe('AuthService', () => {
  describe('AUTH-5 signUp', () => {
    it('AUTH-5 stores the username and the email lower-cased and trimmed', async () => {
      const { service, users, passwords } = harness();
      users.create.mockResolvedValue(userRow());

      await service.signUp({
        username: '  RoTeM  ',
        password: 'a-good-password',
        email: '  Rotem@Example.COM ',
      });

      expect(users.findByUsername).toHaveBeenCalledWith('rotem');
      expect(users.findByEmail).toHaveBeenCalledWith('rotem@example.com');
      expect(passwords.hash).toHaveBeenCalledWith('a-good-password');
      expect(users.create).toHaveBeenCalledWith({
        username: 'rotem',
        email: 'rotem@example.com',
        passwordHash: 'scrypt$131072$8$1$c2FsdA==$a2V5',
      });
    });

    it('AUTH-5 stores a null email when none is given', async () => {
      const { service, users } = harness();
      users.create.mockResolvedValue(userRow({ email: null }));

      await service.signUp({ username: 'rotem', password: 'a-good-password' });

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
      expect(users.findByEmail).not.toHaveBeenCalled();
    });

    it('AUTH-5 answers 409 when the username is taken, without creating a user', async () => {
      const { service, users, passwords } = harness();
      users.findByUsername.mockResolvedValue(userRow());

      await expect(
        service.signUp({ username: 'Rotem', password: 'a-good-password' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.signUp({ username: 'Rotem', password: 'a-good-password' }),
      ).rejects.toThrow('Username is already taken');
      expect(users.create).not.toHaveBeenCalled();
      expect(passwords.hash).not.toHaveBeenCalled();
    });

    it('AUTH-5 answers 409 when the email is already registered', async () => {
      const { service, users } = harness();
      users.findByEmail.mockResolvedValue(userRow());

      await expect(
        service.signUp({
          username: 'someone',
          password: 'a-good-password',
          email: 'ROTEM@example.com',
        }),
      ).rejects.toThrow('Email is already registered');
      expect(users.create).not.toHaveBeenCalled();
    });

    it('AUTH-5 turns the database unique violation of a racing sign-up into 409', async () => {
      const { service, users } = harness();
      users.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          driverError: { code: '23505' },
        }),
      );

      await expect(
        service.signUp({ username: 'rotem', password: 'a-good-password' }),
      ).rejects.toThrow('Username or email is already taken');
    });

    it('AUTH-5 lets any other database error through unchanged', async () => {
      const { service, users } = harness();
      users.create.mockRejectedValue(new Error('connection refused'));

      await expect(
        service.signUp({ username: 'rotem', password: 'a-good-password' }),
      ).rejects.toThrow('connection refused');
    });

    it('AUTH-7 returns an access token, a refresh token and the user', async () => {
      const { service, users } = harness();
      users.create.mockResolvedValue(userRow());

      const result = await service.signUp({
        username: 'rotem',
        password: 'a-good-password',
      });

      expect(result).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        user: {
          id: 'user-1',
          username: 'rotem',
          email: 'rotem@example.com',
          favouriteCategories: [],
          createdAt: CREATED_AT.toISOString(),
        },
      });
      // AUTH-7: the password hash never leaves this library.
      expect(JSON.stringify(result)).not.toContain('scrypt$');
    });
  });

  describe('AUTH-7 signIn', () => {
    it('AUTH-7 returns the token pair and the user for the right password', async () => {
      const { service, users, passwords } = harness();
      users.findByUsername.mockResolvedValue(userRow());

      const result = await service.signIn({
        username: 'rotem',
        password: 'a-good-password',
      });

      expect(passwords.verify).toHaveBeenCalledWith(
        'a-good-password',
        'scrypt$131072$8$1$c2FsdHNhbHRzYWx0c2E=$a2V5',
      );
      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toBe('refresh.jwt');
      expect(result.user.id).toBe('user-1');
    });

    it('AUTH-7 signs the access token with sub and username and the refresh token with sub and typ', async () => {
      const { service, users, jwt, config } = harness({
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '30d',
      });
      users.findByUsername.mockResolvedValue(userRow());

      await service.signIn({ username: 'rotem', password: 'a-good-password' });

      expect(jwt.signAsync).toHaveBeenNthCalledWith(
        1,
        { sub: 'user-1', username: 'rotem' },
        { expiresIn: '15m' },
      );
      expect(jwt.signAsync).toHaveBeenNthCalledWith(
        2,
        { sub: 'user-1', typ: 'refresh' },
        { secret: 'refresh-secret-for-tests', expiresIn: '30d' },
      );
      expect(config.get).toHaveBeenCalledWith('JWT_ACCESS_TTL');
      expect(config.get).toHaveBeenCalledWith('JWT_REFRESH_TTL');
    });

    it('AUTH-7 falls back to the 15m / 30d defaults when the TTL keys are absent', async () => {
      const { service, users, jwt } = harness();
      users.findByUsername.mockResolvedValue(userRow());

      await service.signIn({ username: 'rotem', password: 'a-good-password' });

      expect(jwt.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        { expiresIn: '15m' },
      );
      expect(jwt.signAsync).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });

    it('AUTH-7 answers 401 with the same message for a wrong password as for an unknown user', async () => {
      const wrongPassword = harness();
      wrongPassword.users.findByUsername.mockResolvedValue(userRow());
      wrongPassword.passwords.verify.mockResolvedValue(false);
      const unknownUser = harness();
      unknownUser.users.findByUsername.mockResolvedValue(null);

      const wrong = await failureOf(
        wrongPassword.service.signIn({
          username: 'rotem',
          password: 'nope-nope-nope',
        }),
      );
      const unknown = await failureOf(
        unknownUser.service.signIn({
          username: 'ghost',
          password: 'nope-nope-nope',
        }),
      );

      expect(wrong).toBeInstanceOf(UnauthorizedException);
      expect(unknown).toBeInstanceOf(UnauthorizedException);
      expect(wrong.message).toBe('Invalid username or password');
      expect(unknown.message).toBe(wrong.message);
      expect(wrong.getStatus()).toBe(401);
      expect(unknown.getStatus()).toBe(401);
      // Nothing is signed for either failure.
      expect(wrongPassword.jwt.signAsync).not.toHaveBeenCalled();
      expect(unknownUser.jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('AUTH-7 refresh', () => {
    it('AUTH-7 exchanges a refresh token for a new pair', async () => {
      const { service, users, jwt } = harness();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', typ: 'refresh' });
      users.findById.mockResolvedValue(userRow());

      const result = await service.refresh({ refreshToken: 'the.refresh.jwt' });

      expect(jwt.verifyAsync).toHaveBeenCalledWith('the.refresh.jwt', {
        secret: 'refresh-secret-for-tests',
      });
      expect(result).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        user: expect.objectContaining({ id: 'user-1' }),
      });
    });

    it('AUTH-7 answers 401 when the token is not typed as a refresh token', async () => {
      const { service, users, jwt } = harness();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', username: 'rotem' });

      await expect(
        service.refresh({ refreshToken: 'an.access.jwt' }),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refresh({ refreshToken: 'an.access.jwt' }),
      ).rejects.toThrow('Invalid refresh token');
      expect(users.findById).not.toHaveBeenCalled();
    });

    it.each([
      ['typ: access', { sub: 'user-1', typ: 'access' }],
      ['typ: REFRESH', { sub: 'user-1', typ: 'REFRESH' }],
      ['no sub', { typ: 'refresh' }],
      ['non-string sub', { sub: 42, typ: 'refresh' }],
    ])('AUTH-7 answers 401 for a payload with %s', async (_name, payload) => {
      const { service, jwt } = harness();
      jwt.verifyAsync.mockResolvedValue(payload);

      await expect(
        service.refresh({ refreshToken: 'some.jwt' }),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('AUTH-7 answers 401 when the signature or the expiry is rejected', async () => {
      const { service, jwt } = harness();
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(
        service.refresh({ refreshToken: 'expired.jwt' }),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('AUTH-7 answers 401 when the user behind a valid token no longer exists', async () => {
      const { service, users, jwt } = harness();
      jwt.verifyAsync.mockResolvedValue({ sub: 'deleted-user', typ: 'refresh' });
      users.findById.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'valid.jwt' }),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('AUTH-7 answers 401 when JWT_REFRESH_SECRET is missing', async () => {
      const { service, jwt } = harness({ JWT_REFRESH_SECRET: '' });

      const error = await failureOf(
        service.refresh({ refreshToken: 'valid.jwt' }),
      );

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(error.getStatus()).toBe(401);
      // `refreshSecret()` is resolved before the try block, so its own message
      // reaches the caller instead of the generic 'Invalid refresh token'.
      expect(error.message).toBe('Refresh tokens are not configured');
      expect(jwt.verifyAsync).not.toHaveBeenCalled();
    });

    it('AUTH-7 refuses to issue a token pair when JWT_REFRESH_SECRET is missing', async () => {
      const { service, users } = harness({ JWT_REFRESH_SECRET: '' });
      users.findByUsername.mockResolvedValue(userRow());

      await expect(
        service.signIn({ username: 'rotem', password: 'a-good-password' }),
      ).rejects.toThrow('Refresh tokens are not configured');
    });
  });
});

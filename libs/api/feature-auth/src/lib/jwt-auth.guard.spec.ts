// AUTH-3, AUTH-8: the global bearer-token guard.
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. These
 * tests use plain constructor injection, so those packages are replaced at their module
 * boundary by the decorators and module helpers the files under test touch when loaded.
 */
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
  JwtModule: { register: () => ({}), registerAsync: () => ({}) },
}));


interface Request {
  headers: Record<string, string | string[] | undefined>;
  user?: { id: string; username: string };
}

function contextFor(request: Request): ExecutionContext {
  const handler = function handler(): void {
    /* route handler stand-in */
  };
  class Controller {}
  return {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AUTH-8 JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    jwt = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwt as unknown as JwtService,
    );
  });

  it('AUTH-8 lets a @Public() route through without an Authorization header', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request: Request = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IS_PUBLIC_KEY,
      expect.any(Array),
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('AUTH-8 answers 401 when the Authorization header is missing', async () => {
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toThrow('Missing bearer token');
  });

  it.each([
    ['empty value', ''],
    ['no scheme', 'abc.def.ghi'],
    ['wrong scheme', 'Basic abc.def.ghi'],
    ['empty token', 'Bearer '],
    ['extra part', 'Bearer abc.def.ghi extra'],
  ])('AUTH-8 answers 401 for a malformed header (%s)', async (_name, header) => {
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: header } })),
    ).rejects.toThrow('Missing bearer token');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('AUTH-8 accepts the scheme case-insensitively', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', username: 'rotem' });
    const request: Request = { headers: { authorization: 'bearer the.access.jwt' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('the.access.jwt');
  });

  it('AUTH-8 answers 401 when the token does not verify', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer expired.jwt' } }),
      ),
    ).rejects.toThrow('Invalid or expired access token');
  });

  it('AUTH-4, AUTH-8 puts the caller on the request for a valid access payload', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', username: 'rotem' });
    const request: Request = { headers: { authorization: 'Bearer the.access.jwt' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual({ id: 'user-1', username: 'rotem' });
  });

  it('AUTH-7, AUTH-8 rejects a refresh-typed token on a protected route', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', typ: 'refresh' });
    const request: Request = { headers: { authorization: 'Bearer the.refresh.jwt' } };

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      'Invalid access token',
    );
    expect(request.user).toBeUndefined();
  });

  it.each([
    ['no sub', { username: 'rotem' }],
    ['no username', { sub: 'user-1' }],
    ['non-string sub', { sub: 7, username: 'rotem' }],
    ['a typ claim at all', { sub: 'user-1', username: 'rotem', typ: 'access' }],
  ])('AUTH-8 answers 401 for a payload with %s', async (_name, payload) => {
    jwt.verifyAsync.mockResolvedValue(payload);

    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer some.jwt' } }),
      ),
    ).rejects.toThrow('Invalid access token');
  });
});

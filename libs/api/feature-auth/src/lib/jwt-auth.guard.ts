import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './public.decorator';

const BEARER = 'bearer';

interface AccessPayload {
  sub?: unknown;
  username?: unknown;
  typ?: unknown;
}

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

/** AUTH-8: reads `Authorization: Bearer <token>`; anything malformed is no token at all. */
function bearerToken(request: AuthenticatedRequest): string | null {
  const header = request.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string') return null;
  const [scheme, token, ...rest] = value.split(' ');
  if (rest.length > 0 || token === undefined) return null;
  if (scheme.toLowerCase() !== BEARER || token.length === 0) return null;
  return token;
}

/**
 * AUTH-3, AUTH-8: the global guard. Every route needs a valid access token except
 * the ones marked `@Public()`; everything else is rejected with 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    if (token === null) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: AccessPayload;
    try {
      // The module's default secret is JWT_ACCESS_SECRET (AUTH-7).
      payload = await this.jwt.verifyAsync<AccessPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // AUTH-7: a refresh token carries `typ: 'refresh'` and is not an access token.
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      payload.typ !== undefined
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    request.user = { id: payload.sub, username: payload.username };
    return true;
  }
}

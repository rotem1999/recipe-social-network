import { UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth-user';

/**
 * AUTH-4: the signed-in caller of the current request, put there by
 * {@link JwtAuthGuard}. A route that reaches this without a user is `@Public()`
 * by mistake, so it fails closed.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new UnauthorizedException();
    }
    return request.user;
  },
);

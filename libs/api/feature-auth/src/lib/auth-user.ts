/**
 * AUTH-4, AUTH-8: the signed-in caller, put on the request by {@link JwtAuthGuard}
 * and read by the `@CurrentUser()` parameter decorator.
 */
export interface AuthUser {
  id: string;
  username: string;
}

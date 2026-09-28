import { SetMetadata } from '@nestjs/common';
import type { CustomDecorator } from '@nestjs/common';

/** AUTH-8: metadata key the global guard reads to let a route through unauthenticated. */
export const IS_PUBLIC_KEY = 'isPublic';

/** AUTH-8: marks sign-up, sign-in, refresh and health as open routes. */
export function Public(): CustomDecorator<string> {
  return SetMetadata(IS_PUBLIC_KEY, true);
}

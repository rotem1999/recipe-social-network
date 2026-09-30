// SPEC §11.7 DOC-4: response classes of feature-auth, kept in step with util-contracts.
import type { AuthResponse, UserDto } from '@rsn/shared/util-contracts';
import type { Category } from '@rsn/shared/util-domain';

/** §11.6 `GET /me`: the signed-in user. */
export class UserResponseDto implements UserDto {
  id!: string;

  /** AUTH-5: 3–32 characters of a-z, 0-9, `_`, `.` or `-`, lower-case. */
  username!: string;

  /** AUTH-5: optional, lower-case; null when none is on record. */
  email!: string | null;

  /** DISC-6: at most 3 categories, pinned first in Discover. */
  favouriteCategories!: Category[];

  createdAt!: string;
}

/** AUTH-5..7: `POST /auth/sign-up`, `/auth/sign-in` and `/auth/refresh`. */
export class AuthResponseDto implements AuthResponse {
  /** AUTH-7: the access JWT sent as `Authorization: Bearer <token>`. */
  accessToken!: string;

  /** AUTH-7: exchanged for a new pair at `POST /auth/refresh`. */
  refreshToken!: string;

  user!: UserResponseDto;
}

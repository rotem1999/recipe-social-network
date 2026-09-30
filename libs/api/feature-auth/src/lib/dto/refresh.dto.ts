import { IsNotEmpty, IsString } from 'class-validator';
import type { RefreshRequest } from '@rsn/shared/util-contracts';

/** AUTH-7: `POST /auth/refresh` exchanges a refresh token for a new pair. */
export class RefreshDto implements RefreshRequest {
  // UI-43: messages written for people.
  @IsString({ message: 'Sign in again' })
  @IsNotEmpty({ message: 'Sign in again' })
  refreshToken!: string;
}

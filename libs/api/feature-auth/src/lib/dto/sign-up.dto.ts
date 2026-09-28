import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import type { SignUpRequest } from '@rsn/shared/util-contracts';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@rsn/shared/util-domain';

/** Trims and lower-cases before validation, so AUTH-5 is checked on the stored form. */
const toLowerTrimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** AUTH-5: `POST /auth/sign-up` body. */
export class SignUpDto implements SignUpRequest {
  @IsString()
  @Transform(toLowerTrimmed)
  @Matches(USERNAME_PATTERN, {
    message:
      'username must be 3-32 characters of a-z, 0-9, underscore, dot or hyphen',
  })
  username!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  password!: string;

  @IsOptional()
  @IsString()
  @Transform(toLowerTrimmed)
  @IsEmail()
  email?: string;
}

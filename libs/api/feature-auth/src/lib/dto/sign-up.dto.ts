import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
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

/** AUTH-5, UI-43: the same sentence the sign-up form shows (UI-9). */
const USERNAME_MESSAGE =
  'Use 3 to 32 characters: letters, numbers, underscore, dot or hyphen.';

/** UI-43: the sign-up form's wording for a malformed email (UI-9). */
const EMAIL_MESSAGE = 'Enter an email address like you@example.com.';

/** AUTH-5: `POST /auth/sign-up` body; UI-43: messages written for people. */
export class SignUpDto implements SignUpRequest {
  @IsString({ message: USERNAME_MESSAGE })
  @Transform(toLowerTrimmed)
  @Matches(USERNAME_PATTERN, { message: USERNAME_MESSAGE })
  username!: string;

  @IsString({ message: 'Enter a password' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  })
  password!: string;

  @IsOptional()
  @IsString({ message: EMAIL_MESSAGE })
  @Transform(toLowerTrimmed)
  @IsEmail({}, { message: EMAIL_MESSAGE })
  email?: string;
}

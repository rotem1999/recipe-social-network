import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SignInRequest } from '@rsn/shared/util-contracts';

/** AUTH-5: sign-in takes username + password; the username is matched lower-case. */
export class SignInDto implements SignInRequest {
  // UI-43: messages written for people.
  @IsString({ message: 'Enter your username' })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty({ message: 'Enter your username' })
  username!: string;

  @IsString({ message: 'Enter your password' })
  @IsNotEmpty({ message: 'Enter your password' })
  password!: string;
}

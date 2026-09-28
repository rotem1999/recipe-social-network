import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import type { SignInRequest } from '@rsn/shared/util-contracts';

/** AUTH-5: sign-in takes username + password; the username is matched lower-case. */
export class SignInDto implements SignInRequest {
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

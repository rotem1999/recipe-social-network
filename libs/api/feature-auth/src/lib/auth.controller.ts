import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { AuthResponse } from '@rsn/shared/util-contracts';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshDto } from './dto/refresh.dto';

/** §11.6: `POST auth/sign-up`, `auth/sign-in`, `auth/refresh` (AUTH-5..7), all open. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('sign-up')
  signUp(@Body() body: SignUpDto): Promise<AuthResponse> {
    return this.auth.signUp(body);
  }

  @Public()
  @HttpCode(200)
  @Post('sign-in')
  signIn(@Body() body: SignInDto): Promise<AuthResponse> {
    return this.auth.signIn(body);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: RefreshDto): Promise<AuthResponse> {
    return this.auth.refresh(body);
  }
}

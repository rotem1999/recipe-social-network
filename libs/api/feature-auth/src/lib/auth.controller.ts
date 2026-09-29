import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshDto } from './dto/refresh.dto';

/**
 * §11.6: `POST auth/sign-up`, `auth/sign-in`, `auth/refresh` (AUTH-5..7), all open.
 * DOC-6: public routes, so the controller carries no bearer requirement.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @ApiErrorResponses(400, 409)
  @Post('sign-up')
  signUp(@Body() body: SignUpDto): Promise<AuthResponseDto> {
    return this.auth.signUp(body);
  }

  @Public()
  @ApiErrorResponses(400, 401)
  @HttpCode(200)
  @Post('sign-in')
  signIn(@Body() body: SignInDto): Promise<AuthResponseDto> {
    return this.auth.signIn(body);
  }

  @Public()
  @ApiErrorResponses(400, 401)
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: RefreshDto): Promise<AuthResponseDto> {
    return this.auth.refresh(body);
  }
}

import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { UsersService } from './users.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';
import { UserResponseDto } from './dto/auth-response.dto';

/** §11.6: `GET me` — id, username, email and favourite categories of the caller. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @ApiErrorResponses(401)
  @Get()
  async me(@CurrentUser() caller: AuthUser): Promise<UserResponseDto> {
    const user = await this.users.findById(caller.id);
    if (user === null) {
      // The token is valid but the account is gone: the token is worthless.
      throw new UnauthorizedException('User no longer exists');
    }
    return this.users.toDto(user);
  }
}

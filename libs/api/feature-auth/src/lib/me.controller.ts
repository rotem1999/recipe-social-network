import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import type { UserDto } from '@rsn/shared/util-contracts';
import { UsersService } from './users.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user';

/** §11.6: `GET me` — id, username, email and favourite categories of the caller. */
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() caller: AuthUser): Promise<UserDto> {
    const user = await this.users.findById(caller.id);
    if (user === null) {
      // The token is valid but the account is gone: the token is worthless.
      throw new UnauthorizedException('User no longer exists');
    }
    return this.users.toDto(user);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { UserSearchResponse } from '@rsn/shared/util-contracts';
import { FriendsService } from './friends.service';

/** §11.6 `GET /users/search?q=` — FR-3, FR-4. */
@Controller('users')
export class UserSearchController {
  constructor(private readonly friends: FriendsService) {}

  /** FR-4: at most 10 users; the caller and existing friends are marked. */
  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
  ): Promise<UserSearchResponse> {
    return this.friends.search(user.id, q ?? '');
  }
}

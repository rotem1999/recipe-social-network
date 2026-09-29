import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { UserSearchResponseDto } from './dto/friends-response.dto';
import { FriendsService } from './friends.service';

/** §11.6 `GET /users/search?q=` — FR-3, FR-4. */
@ApiTags('friends')
@ApiBearerAuth()
@Controller('users')
export class UserSearchController {
  constructor(private readonly friends: FriendsService) {}

  /** FR-4: at most 10 users; the caller and existing friends are marked. */
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Username prefix (case-insensitive) or an exact email (FR-4).',
  })
  @ApiErrorResponses(401)
  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
  ): Promise<UserSearchResponseDto> {
    return this.friends.search(user.id, q ?? '');
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { FriendsResponse } from '@rsn/shared/util-contracts';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';

/**
 * §11.6 friend routes (FR-2, FR-4). Every mutation returns the updated `FriendsResponse`
 * (§11.6 response-body paragraph).
 */
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  /** §11.6 `GET /friends`. */
  @Get()
  getFriends(@CurrentUser() user: AuthUser): Promise<FriendsResponse> {
    return this.friends.getFriends(user.id);
  }

  /** §11.6 `POST /friends/requests` — FR-2. */
  @Post('requests')
  sendRequest(
    @CurrentUser() user: AuthUser,
    @Body() body: SendFriendRequestDto,
  ): Promise<FriendsResponse> {
    return this.friends.sendRequest(user.id, body.userId);
  }

  /** §11.6 `POST /friends/requests/:id/accept` — receiver only. */
  @Post('requests/:id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponse> {
    return this.friends.accept(user.id, id);
  }

  /** §11.6 `POST /friends/requests/:id/decline` — receiver only. */
  @Post('requests/:id/decline')
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponse> {
    return this.friends.decline(user.id, id);
  }

  /** §11.6 `DELETE /friends/requests/:id` — sender only (cancel). */
  @Delete('requests/:id')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponse> {
    return this.friends.cancel(user.id, id);
  }

  /** §11.6 `DELETE /friends/:userId` — FR-4: also removes every share between the two. */
  @Delete(':userId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<FriendsResponse> {
    return this.friends.remove(user.id, userId);
  }
}

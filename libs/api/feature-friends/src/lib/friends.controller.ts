import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { FriendsResponseDto } from './dto/friends-response.dto';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { FriendsService } from './friends.service';

/**
 * §11.6 friend routes (FR-2, FR-4). Every mutation returns the updated `FriendsResponse`
 * (§11.6 response-body paragraph).
 */
@ApiTags('friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  /** §11.6 `GET /friends`. */
  @ApiErrorResponses(401)
  @Get()
  getFriends(@CurrentUser() user: AuthUser): Promise<FriendsResponseDto> {
    return this.friends.getFriends(user.id);
  }

  /** §11.6 `POST /friends/requests` — FR-2. */
  @ApiErrorResponses(400, 401, 404, 409)
  @Post('requests')
  sendRequest(
    @CurrentUser() user: AuthUser,
    @Body() body: SendFriendRequestDto,
  ): Promise<FriendsResponseDto> {
    return this.friends.sendRequest(user.id, body.userId);
  }

  /** §11.6 `POST /friends/requests/:id/accept` — receiver only. */
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Post('requests/:id/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponseDto> {
    return this.friends.accept(user.id, id);
  }

  /** §11.6 `POST /friends/requests/:id/decline` — receiver only. */
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Post('requests/:id/decline')
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponseDto> {
    return this.friends.decline(user.id, id);
  }

  /** §11.6 `DELETE /friends/requests/:id` — sender only (cancel). */
  @ApiErrorResponses(400, 401, 403, 404, 409)
  @Delete('requests/:id')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FriendsResponseDto> {
    return this.friends.cancel(user.id, id);
  }

  /** §11.6 `DELETE /friends/:userId` — FR-4: also removes every share between the two. */
  @ApiErrorResponses(400, 401, 404)
  @Delete(':userId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<FriendsResponseDto> {
    return this.friends.remove(user.id, userId);
  }
}

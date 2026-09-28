import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import type {
  CommentDto,
  CommentsResponse,
  RatingSummaryDto,
} from '@rsn/shared/util-contracts';
import { CommentsService } from './comments.service';
import { CommentRequestDto } from './dto/comment.dto';
import { RatingRequestDto } from './dto/rating.dto';
import { VoteRequestDto } from './dto/vote.dto';
import { RatingsService } from './ratings.service';

/** §11.6: the rating and comment routes (RATE-1..4, COM-1..3). */
@Controller()
export class SocialController {
  constructor(
    private readonly ratings: RatingsService,
    private readonly comments: CommentsService,
  ) {}

  /** RATE-1, RATE-4: grade a public recipe; rating again replaces the earlier value. */
  @Put('recipes/:id/rating')
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RatingRequestDto,
  ): Promise<RatingSummaryDto> {
    return this.ratings.rate(user.id, id, body.stars);
  }

  /** RATE-2, RATE-3: the stored average and count, plus the caller's own grade. */
  @Get('recipes/:id/rating')
  rating(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RatingSummaryDto> {
    return this.ratings.summary(user.id, id);
  }

  /** COM-1, COM-3: the comment list of a public or shared recipe. */
  @Get('recipes/:id/comments')
  listComments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommentsResponse> {
    return this.comments.list(user.id, id);
  }

  /** COM-3: write a comment, 1 to 2000 characters. */
  @Post('recipes/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommentRequestDto,
  ): Promise<CommentDto> {
    return this.comments.create(user.id, user.username, id, body.body);
  }

  /** COM-3: the author deletes their own comment. */
  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.comments.remove(user.id, id);
  }

  /** COM-2: up/down vote on a public recipe's comment; `0` removes the vote. */
  @Put('comments/:id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoteRequestDto,
  ): Promise<CommentDto> {
    return this.comments.vote(user.id, id, body.value);
  }
}

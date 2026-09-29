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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@rsn/api/feature-auth';
import type { AuthUser } from '@rsn/api/feature-auth';
import { RatingSummaryResponseDto } from '@rsn/api/feature-recipes';
import { ApiErrorResponses } from '@rsn/api/util-openapi';
import { CommentsService } from './comments.service';
import { CommentRequestDto } from './dto/comment.dto';
import { RatingRequestDto } from './dto/rating.dto';
import {
  CommentResponseDto,
  CommentsResponseDto,
} from './dto/social-response.dto';
import { VoteRequestDto } from './dto/vote.dto';
import { RatingsService } from './ratings.service';

/** §11.6: the rating and comment routes (RATE-1..4, COM-1..3). */
@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(
    private readonly ratings: RatingsService,
    private readonly comments: CommentsService,
  ) {}

  /** RATE-1, RATE-4: grade a public recipe; rating again replaces the earlier value. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Put('recipes/:id/rating')
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RatingRequestDto,
  ): Promise<RatingSummaryResponseDto> {
    return this.ratings.rate(user.id, id, body.stars);
  }

  /** RATE-2, RATE-3: the stored average and count, plus the caller's own grade. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Get('recipes/:id/rating')
  rating(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RatingSummaryResponseDto> {
    return this.ratings.summary(user.id, id);
  }

  /** COM-1, COM-3: the comment list of a public or shared recipe. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Get('recipes/:id/comments')
  listComments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CommentsResponseDto> {
    return this.comments.list(user.id, id);
  }

  /** COM-3: write a comment, 1 to 2000 characters. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Post('recipes/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CommentRequestDto,
  ): Promise<CommentResponseDto> {
    return this.comments.create(user.id, user.username, id, body.body);
  }

  /** COM-3: the author deletes their own comment. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.comments.remove(user.id, id);
  }

  /** COM-2: up/down vote on a public recipe's comment; `0` removes the vote. */
  @ApiErrorResponses(400, 401, 403, 404)
  @Put('comments/:id/vote')
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VoteRequestDto,
  ): Promise<CommentResponseDto> {
    return this.comments.vote(user.id, id, body.value);
  }
}

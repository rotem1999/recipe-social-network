import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  CommentEntity,
  CommentVoteEntity,
  RecipeEntity,
} from '@rsn/api/data-access-db';
import { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { CommentDto, CommentsResponse } from '@rsn/shared/util-contracts';

/** Shape of the grouped vote sum read back from `comment_votes` (COM-2). */
interface VoteSumRow {
  commentId: string;
  points: string;
}

/** COM-1..3: the comment section of public and shared recipes, with votes on public ones. */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly comments: Repository<CommentEntity>,
    @InjectRepository(CommentVoteEntity)
    private readonly votes: Repository<CommentVoteEntity>,
    private readonly access: RecipeAccessService,
  ) {}

  /** COM-3: the comment list, ranked by points then newest, soft-deleted rows excluded. */
  async list(userId: string, recipeId: string): Promise<CommentsResponse> {
    const recipe = await this.loadCommentableOrThrow(userId, recipeId);
    const votesEnabled = this.votesEnabled(recipe);

    const rows = await this.comments.find({
      where: { recipeId: recipe.id, deletedAt: IsNull() },
      relations: { user: true },
    });
    const ids = rows.map((row) => row.id);
    // COM-2: points and the caller's own vote only exist on public recipes.
    const points = votesEnabled
      ? await this.pointsFor(ids)
      : new Map<string, number>();
    const myVotes = votesEnabled
      ? await this.myVotesFor(userId, ids)
      : new Map<string, 1 | -1>();

    const comments = rows
      .map((row) =>
        this.toDto(
          row,
          row.user?.username ?? '',
          points.get(row.id) ?? 0,
          myVotes.get(row.id) ?? 0,
        ),
      )
      // COM-3: ordered by points, then by creation time, newest first.
      .sort(
        (a, b) =>
          b.points - a.points ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );

    return { comments, votesEnabled };
  }

  /** COM-3: write a comment on a recipe the caller can see. */
  async create(
    userId: string,
    username: string,
    recipeId: string,
    body: string,
  ): Promise<CommentDto> {
    const recipe = await this.loadCommentableOrThrow(userId, recipeId);
    const saved = await this.comments.save(
      this.comments.create({
        recipeId: recipe.id,
        userId,
        body,
        deletedAt: null,
      }),
    );
    return this.toDto(saved, username, 0, 0);
  }

  /** COM-3: the author, and only the author, deletes their own comment (soft delete). */
  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.loadCommentOrThrow(commentId);
    if (comment.userId !== userId) {
      throw new ForbiddenException('Only the author can delete this comment');
    }
    comment.deletedAt = new Date();
    await this.comments.save(comment);
  }

  /** COM-2, COM-3: up/down vote on a public recipe's comment; `0` removes the vote. */
  async vote(
    userId: string,
    commentId: string,
    value: 1 | -1 | 0,
  ): Promise<CommentDto> {
    const comment = await this.loadCommentOrThrow(commentId);
    const recipe = await this.access.loadOrThrow(comment.recipeId);
    await this.access.assertCanView(userId, recipe);
    if (!this.votesEnabled(recipe)) {
      throw new ForbiddenException(
        'Comment votes exist on public recipes only',
      );
    }

    const existing = await this.votes.findOne({
      where: { commentId: comment.id, userId },
    });
    if (value === 0) {
      if (existing) {
        await this.votes.remove(existing);
      }
    } else if (existing) {
      existing.value = value;
      await this.votes.save(existing);
    } else {
      await this.votes.save(
        this.votes.create({ commentId: comment.id, userId, value }),
      );
    }

    const points = await this.pointsFor([comment.id]);
    return this.toDto(
      comment,
      comment.user?.username ?? '',
      points.get(comment.id) ?? 0,
      value,
    );
  }

  /**
   * COM-1: the comment section exists on public and shared recipes. A private recipe has
   * none, so even its owner gets 403 here.
   */
  private async loadCommentableOrThrow(
    userId: string,
    recipeId: string,
  ): Promise<RecipeEntity> {
    const recipe = await this.access.loadOrThrow(recipeId);
    await this.access.assertCanView(userId, recipe);
    if (recipe.visibility === 'private') {
      throw new ForbiddenException('Private recipes have no comment section');
    }
    return recipe;
  }

  /** COM-3: a live (not soft-deleted) comment, with its author loaded. */
  private async loadCommentOrThrow(commentId: string): Promise<CommentEntity> {
    const comment = await this.comments.findOne({
      where: { id: commentId, deletedAt: IsNull() },
      relations: { user: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  /** COM-2: votes are enabled on public recipes; shared recipes show comments without them. */
  private votesEnabled(recipe: RecipeEntity): boolean {
    return recipe.visibility === 'public';
  }

  /** COM-2: points are the integer sum of the votes of one comment. */
  private async pointsFor(commentIds: string[]): Promise<Map<string, number>> {
    const points = new Map<string, number>();
    if (commentIds.length === 0) {
      return points;
    }
    const rows = await this.votes
      .createQueryBuilder('vote')
      .select('vote.commentId', 'commentId')
      .addSelect('SUM(vote.value)', 'points')
      .where('vote.commentId IN (:...commentIds)', { commentIds })
      .groupBy('vote.commentId')
      .getRawMany<VoteSumRow>();
    for (const row of rows) {
      points.set(row.commentId, Number(row.points));
    }
    return points;
  }

  /** COM-3: the caller's own vote per comment. */
  private async myVotesFor(
    userId: string,
    commentIds: string[],
  ): Promise<Map<string, 1 | -1>> {
    const mine = new Map<string, 1 | -1>();
    if (commentIds.length === 0) {
      return mine;
    }
    const rows = await this.votes.find({
      where: { userId, commentId: In(commentIds) },
    });
    for (const row of rows) {
      mine.set(row.commentId, row.value === 1 ? 1 : -1);
    }
    return mine;
  }

  /** §11.6 `CommentDto`. */
  private toDto(
    comment: CommentEntity,
    authorUsername: string,
    points: number,
    myVote: 1 | -1 | 0,
  ): CommentDto {
    return {
      id: comment.id,
      recipeId: comment.recipeId,
      authorId: comment.userId,
      authorUsername,
      body: comment.body,
      points,
      myVote,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}

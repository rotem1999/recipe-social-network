// SPEC §11.7 DOC-4: response classes of feature-social, kept in step with util-contracts.
// The rating routes return RatingSummaryResponseDto from feature-recipes, which also
// nests it in the recipe card.
import { ApiProperty } from '@nestjs/swagger';
import type { CommentDto, CommentsResponse } from '@rsn/shared/util-contracts';

/** COM-3: one comment. */
export class CommentResponseDto implements CommentDto {
  id!: string;
  recipeId!: string;
  authorId!: string;
  authorUsername!: string;
  body!: string;

  /** COM-2, COM-3: the sum of votes; 0 on shared recipes. */
  points!: number;

  /** COM-3: the caller's own vote; 0 when none. */
  // DOC-5: the plugin cannot read a union holding `-1`, so the values are listed here.
  @ApiProperty({ enum: [1, -1, 0] })
  myVote!: 1 | -1 | 0;

  createdAt!: string;
}

/** COM-1, COM-3: ordered by points, then newest. */
export class CommentsResponseDto implements CommentsResponse {
  comments!: CommentResponseDto[];

  /** COM-2: votes exist on public recipes only. */
  votesEnabled!: boolean;
}

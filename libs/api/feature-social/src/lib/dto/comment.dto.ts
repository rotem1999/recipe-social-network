import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CommentRequest } from '@rsn/shared/util-contracts';
import { COMMENT_MAX_LENGTH } from '@rsn/shared/util-domain';

/**
 * COM-3: body of `POST /recipes/:id/comments` — 1 to 2000 characters after trimming
 * surrounding whitespace, so a whitespace-only comment answers 400.
 */
export class CommentRequestDto implements CommentRequest {
  // UI-43: messages written for people.
  @IsString({ message: 'Write a comment' })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(1, { message: 'Write a comment' })
  @MaxLength(COMMENT_MAX_LENGTH, {
    message: `Comments can be at most ${COMMENT_MAX_LENGTH} characters`,
  })
  body!: string;
}

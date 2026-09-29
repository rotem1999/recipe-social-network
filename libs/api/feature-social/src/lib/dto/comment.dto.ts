import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import type { CommentRequest } from '@rsn/shared/util-contracts';
import { COMMENT_MAX_LENGTH } from '@rsn/shared/util-domain';

/**
 * COM-3: body of `POST /recipes/:id/comments` — 1 to 2000 characters after trimming
 * surrounding whitespace, so a whitespace-only comment answers 400.
 */
export class CommentRequestDto implements CommentRequest {
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, COMMENT_MAX_LENGTH)
  body!: string;
}

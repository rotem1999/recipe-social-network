import { IsString, Length } from 'class-validator';
import type { CommentRequest } from '@rsn/shared/util-contracts';
import { COMMENT_MAX_LENGTH } from '@rsn/shared/util-domain';

/** COM-3: body of `POST /recipes/:id/comments` — 1 to 2000 characters. */
export class CommentRequestDto implements CommentRequest {
  @IsString()
  @Length(1, COMMENT_MAX_LENGTH)
  body!: string;
}

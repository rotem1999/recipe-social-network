import { IsIn } from 'class-validator';
import type { VoteRequest } from '@rsn/shared/util-contracts';

/** COM-2, COM-3: body of `PUT /comments/:id/vote` — `1`, `-1`, or `0` to remove the vote. */
export class VoteRequestDto implements VoteRequest {
  @IsIn([1, -1, 0])
  value!: 1 | -1 | 0;
}

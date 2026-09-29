import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { VoteRequest } from '@rsn/shared/util-contracts';

/** COM-2, COM-3: body of `PUT /comments/:id/vote` — `1`, `-1`, or `0` to remove the vote. */
export class VoteRequestDto implements VoteRequest {
  // DOC-5: the plugin cannot read a union holding `-1`, so the values are listed here.
  @ApiProperty({ enum: [1, -1, 0] })
  @IsIn([1, -1, 0])
  value!: 1 | -1 | 0;
}

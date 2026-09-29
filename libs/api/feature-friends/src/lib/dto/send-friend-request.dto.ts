import { IsUUID } from 'class-validator';
import type { SendFriendRequest } from '@rsn/shared/util-contracts';

/** §11.6 `POST /friends/requests` body — FR-2. */
export class SendFriendRequestDto implements SendFriendRequest {
  @IsUUID()
  userId!: string;
}

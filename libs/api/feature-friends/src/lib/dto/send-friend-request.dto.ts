import { IsUUID } from 'class-validator';
import type { SendFriendRequest } from '@rsn/shared/util-contracts';

/** §11.6 `POST /friends/requests` body — FR-2. */
export class SendFriendRequestDto implements SendFriendRequest {
  // UI-43: a message written for people.
  @IsUUID(undefined, { message: 'Choose someone to add as a friend' })
  userId!: string;
}

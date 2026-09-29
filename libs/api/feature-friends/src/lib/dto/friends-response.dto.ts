// SPEC §11.7 DOC-4: response classes of feature-friends, kept in step with util-contracts.
import type {
  FriendDto,
  FriendRequestDto,
  FriendsResponse,
  UserSearchResponse,
  UserSearchResultDto,
} from '@rsn/shared/util-contracts';

/** FR-4: one match of `GET /users/search`. */
export class UserSearchResultResponseDto implements UserSearchResultDto {
  id!: string;
  username!: string;

  /** FR-4: the match is the caller. */
  isSelf!: boolean;

  /** FR-4: the match is already a friend. */
  isFriend!: boolean;

  /** The pending request between the caller and the match, if any. */
  pendingRequestId!: string | null;
}

/** FR-3, FR-4: at most 10 users. */
export class UserSearchResponseDto implements UserSearchResponse {
  users!: UserSearchResultResponseDto[];
}

/** FR-2: an accepted friendship. */
export class FriendResponseDto implements FriendDto {
  userId!: string;
  username!: string;
  since!: string;
}

/** FR-2: a pending request. */
export class FriendRequestResponseDto implements FriendRequestDto {
  id!: string;
  fromUserId!: string;
  fromUsername!: string;
  toUserId!: string;
  toUsername!: string;
  createdAt!: string;
}

/** §11.6 `GET /friends` and every friend mutation. */
export class FriendsResponseDto implements FriendsResponse {
  friends!: FriendResponseDto[];

  /** Pending requests sent to the caller. */
  incoming!: FriendRequestResponseDto[];

  /** Pending requests the caller sent. */
  outgoing!: FriendRequestResponseDto[];
}

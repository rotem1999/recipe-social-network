// §4 (FR-1..FR-4): the friend system — public surface of `@rsn/api/feature-friends`.
export { FriendsModule } from './lib/friends.module';
export { FriendsService } from './lib/friends.service';
export { FriendsController } from './lib/friends.controller';
export { UserSearchController } from './lib/user-search.controller';
export { SendFriendRequestDto } from './lib/dto/send-friend-request.dto';
export {
  FriendRequestResponseDto,
  FriendResponseDto,
  FriendsResponseDto,
  UserSearchResponseDto,
  UserSearchResultResponseDto,
} from './lib/dto/friends-response.dto';

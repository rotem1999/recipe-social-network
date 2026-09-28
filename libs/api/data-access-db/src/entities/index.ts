import { AiDailyUsageEntity } from './ai-daily-usage.entity';
import { CommentEntity } from './comment.entity';
import { CommentVoteEntity } from './comment-vote.entity';
import { FriendRequestEntity } from './friend-request.entity';
import { RatingEntity } from './rating.entity';
import { RecipeEntity } from './recipe.entity';
import { RecipeShareEntity } from './recipe-share.entity';
import { RecipeVersionEntity } from './recipe-version.entity';
import { UserEntity } from './user.entity';

export { AiDailyUsageEntity } from './ai-daily-usage.entity';
export { CommentEntity } from './comment.entity';
export { CommentVoteEntity } from './comment-vote.entity';
export {
  FriendRequestEntity,
  FRIEND_REQUEST_STATUSES,
} from './friend-request.entity';
export type { FriendRequestStatus } from './friend-request.entity';
export { RatingEntity } from './rating.entity';
export { RecipeEntity } from './recipe.entity';
export { RecipeShareEntity } from './recipe-share.entity';
export { RecipeVersionEntity } from './recipe-version.entity';
export { UserEntity } from './user.entity';
export { numericTransformer } from './numeric.transformer';

/**
 * §12.1: every table of the schema, listed explicitly (no globs) so the DataSource works
 * when the API is bundled by webpack.
 */
export const ENTITIES = [
  UserEntity,
  RecipeEntity,
  RecipeVersionEntity,
  RecipeShareEntity,
  FriendRequestEntity,
  RatingEntity,
  CommentEntity,
  CommentVoteEntity,
  AiDailyUsageEntity,
];

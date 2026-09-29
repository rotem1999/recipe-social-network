// SPEC.md §11.6: request/response DTO types shared by the API and the client
// (libs/shared/util-contracts/CLAUDE.md). Depends on util-domain only.
import type {
  Category,
  Ingredient,
  RecipeContent,
  RecipeRelation,
  RecipeSource,
  Step,
  Visibility,
} from '@rsn/shared/util-domain';

// ---------- auth (§2) ----------

export interface UserDto {
  id: string;
  username: string;
  email: string | null;
  favouriteCategories: Category[];
  createdAt: string;
}

export interface SignUpRequest {
  username: string;
  password: string;
  email?: string;
}

export interface SignInRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface FavouriteCategoriesRequest {
  categories: Category[];
}

// ---------- friends (§4) ----------

export interface UserSearchResultDto {
  id: string;
  username: string;
  isSelf: boolean;
  isFriend: boolean;
  pendingRequestId: string | null;
}

export interface UserSearchResponse {
  users: UserSearchResultDto[];
}

export interface FriendDto {
  userId: string;
  username: string;
  since: string;
}

export interface FriendRequestDto {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  createdAt: string;
}

export interface FriendsResponse {
  friends: FriendDto[];
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

export interface SendFriendRequest {
  userId: string;
}

// ---------- recipes (§3) ----------

export interface RatingSummaryDto {
  average: number | null;
  count: number;
  mine: number | null;
}

export interface RecipeAttributionDto {
  recipeId: string | null;
  title: string;
  ownerUsername: string | null;
}

export interface RecipeCardDto {
  id: string;
  title: string;
  category: Category;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  visibility: Visibility;
  relation: RecipeRelation;
  ownerUsername: string;
  source: RecipeSource;
  imageUrl: string | null;
  rating: RatingSummaryDto | null;
  versionNumber: number;
  updatedAt: string;
}

export interface RecipeDetailDto extends RecipeCardDto {
  description?: string;
  ingredients: Ingredient[];
  steps: Step[];
  imageUrls: string[];
  canCook: boolean;
  canEdit: boolean;
  canRate: boolean;
  hasComments: boolean;
  hasVotes: boolean;
  versionCount: number;
  forkedFrom: RecipeAttributionDto | null;
  savedFrom: RecipeAttributionDto | null;
  sharedWithUserIds: string[];
  attribution: string | null;
}

export interface RecipeVersionSummaryDto {
  versionNumber: number;
  title: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface RecipeVersionsResponse {
  versions: RecipeVersionSummaryDto[];
}

export type RecipeWriteRequest = RecipeContent;

export interface RecipeListResponse {
  recipes: RecipeCardDto[];
}

export interface VisibilityRequest {
  visibility: Visibility;
  sharedWithUserIds?: string[];
}

export interface ImageUploadResponse {
  imageUrls: string[];
}

// ---------- discover (§5) ----------

export interface CatalogueItemDto {
  mealId: string;
  name: string;
  thumbnailUrl: string;
  category: Category;
}

export interface DiscoverCategoryDto {
  category: Category;
  isFavourite: boolean;
  recipes: RecipeCardDto[];
  catalogue: CatalogueItemDto[];
  page: number;
  hasMore: boolean;
}

export interface DiscoverResponse {
  categories: DiscoverCategoryDto[];
  attribution: string;
}

export interface CataloguePreviewDto extends RecipeContent {
  mealId: string;
  thumbnailUrl: string;
  area: string | null;
  attribution: string;
}

// ---------- social (§6) ----------

export interface RatingRequest {
  stars: number;
}

export interface CommentDto {
  id: string;
  recipeId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  points: number;
  myVote: 1 | -1 | 0;
  createdAt: string;
}

export interface CommentsResponse {
  comments: CommentDto[];
  votesEnabled: boolean;
}

export interface CommentRequest {
  body: string;
}

export interface VoteRequest {
  value: 1 | -1 | 0;
}

// ---------- cook mode (§7) ----------

export interface CookAskRequest {
  recipeId: string;
  stepIndex: number;
  question?: string;
}

export interface QuotaDto {
  used: number;
  limit: number;
  remaining: number;
}

export interface CookAskResponse {
  answer: string;
  quota: QuotaDto;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

// ---------- recommendations (§8) ----------

export type RecommendScope = 'home' | 'discover';

export interface RecommendRequest {
  timezone: string;
  scope: RecommendScope;
  excludeRecipeIds?: string[];
}

export interface WeatherContextDto {
  city: string;
  temperatureC: number;
  isDay: boolean;
  condition: string;
  localHour: number;
  line: string;
}

export interface RecommendationDto {
  recipe: RecipeCardDto;
  reason: string;
}

export interface RecommendResponse {
  picks: RecommendationDto[];
  weather: WeatherContextDto | null;
  quota: QuotaDto;
}

// ---------- nutrition (§9) ----------

export type NutritionMode = 'ingredients' | 'meal';

export interface IngredientNutritionDto {
  name: string;
  grams: number | null;
  kcal: number | null;
  matchedDescription: string | null;
}

export interface NutritionResponse {
  mode: NutritionMode;
  servings: number;
  kcalPerPortion: number | null;
  kcalTotal: number | null;
  partial: boolean;
  ingredients: IngredientNutritionDto[];
  matchedDescription: string | null;
  source: 'USDA FoodData Central';
}

// ---------- misc ----------

export interface HealthResponse {
  status: 'ok';
  time: string;
}

export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

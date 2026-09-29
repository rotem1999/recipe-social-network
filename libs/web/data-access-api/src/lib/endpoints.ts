// SPEC.md §11.6: one typed function per route. Every request and response type
// comes from `@rsn/shared/util-contracts` and is never redefined here
// (libs/web/data-access-api/CLAUDE.md).
import type {
  AuthResponse,
  CataloguePreviewDto,
  CommentDto,
  CommentRequest,
  CommentsResponse,
  CookAskRequest,
  CookAskResponse,
  DiscoverResponse,
  FavouriteCategoriesRequest,
  FriendsResponse,
  HealthResponse,
  ImageUploadResponse,
  NutritionMode,
  NutritionResponse,
  QuotaDto,
  RatingSummaryDto,
  RecipeDetailDto,
  RecipeListResponse,
  RecipeVersionsResponse,
  RecipeWriteRequest,
  RecommendRequest,
  RecommendResponse,
  RefreshRequest,
  SignInRequest,
  SignUpRequest,
  UserDto,
  UserSearchResponse,
  VisibilityRequest,
} from '@rsn/shared/util-contracts';
import { ApiClient, apiClient } from './client';

/** Builds `?a=b` from the parameters that are set; returns '' when none are. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : '';
}

/** Every §11.6 route, bound to one {@link ApiClient}. */
export interface Endpoints {
  // ---------- liveness (§11.6) ----------
  health(): Promise<HealthResponse>;

  // ---------- auth (§2 AUTH-5..8) ----------
  signUp(body: SignUpRequest): Promise<AuthResponse>;
  signIn(body: SignInRequest): Promise<AuthResponse>;
  refresh(body: RefreshRequest): Promise<AuthResponse>;
  me(): Promise<UserDto>;
  setFavouriteCategories(body: FavouriteCategoriesRequest): Promise<UserDto>;

  // ---------- friends (§4) ----------
  searchUsers(q: string): Promise<UserSearchResponse>;
  getFriends(): Promise<FriendsResponse>;
  sendFriendRequest(userId: string): Promise<FriendsResponse>;
  acceptRequest(id: string): Promise<FriendsResponse>;
  declineRequest(id: string): Promise<FriendsResponse>;
  cancelRequest(id: string): Promise<FriendsResponse>;
  removeFriend(userId: string): Promise<FriendsResponse>;

  // ---------- recipes (§3) ----------
  listRecipes(): Promise<RecipeListResponse>;
  createRecipe(body: RecipeWriteRequest): Promise<RecipeDetailDto>;
  getRecipe(id: string): Promise<RecipeDetailDto>;
  updateRecipe(id: string, body: RecipeWriteRequest): Promise<RecipeDetailDto>;
  setVisibility(id: string, body: VisibilityRequest): Promise<RecipeDetailDto>;
  deleteRecipe(id: string): Promise<void>;
  saveRecipe(id: string): Promise<RecipeDetailDto>;
  saveCatalogue(mealId: string): Promise<RecipeDetailDto>;
  syncRecipe(id: string): Promise<RecipeDetailDto>;
  uploadImage(id: string, file: File): Promise<ImageUploadResponse>;
  deleteImage(id: string, index: number): Promise<ImageUploadResponse>;
  listVersions(id: string): Promise<RecipeVersionsResponse>;
  getVersion(id: string, n: number): Promise<RecipeDetailDto>;

  // ---------- nutrition (§9) ----------
  getNutrition(id: string, mode: NutritionMode): Promise<NutritionResponse>;

  // ---------- discover (§5) ----------
  discover(category?: string, page?: number): Promise<DiscoverResponse>;
  cataloguePreview(mealId: string): Promise<CataloguePreviewDto>;

  // ---------- ratings, comments and votes (§6) ----------
  rate(id: string, stars: number): Promise<RatingSummaryDto>;
  getRating(id: string): Promise<RatingSummaryDto>;
  listComments(id: string): Promise<CommentsResponse>;
  postComment(id: string, body: CommentRequest): Promise<CommentDto>;
  deleteComment(id: string): Promise<void>;
  vote(commentId: string, value: 1 | -1 | 0): Promise<CommentDto>;

  // ---------- cook mode (§7) ----------
  cookAsk(body: CookAskRequest): Promise<CookAskResponse>;
  cookQuota(): Promise<QuotaDto>;

  // ---------- recommendations (§8) ----------
  recommend(body: RecommendRequest): Promise<RecommendResponse>;
}

/** Binds the §11.6 routes to a client (tests pass their own). */
export function createEndpoints(client: ApiClient = apiClient): Endpoints {
  return {
    health: () => client.get<HealthResponse>('/health'),

    // AUTH-5..7
    signUp: (body) => client.post<AuthResponse>('/auth/sign-up', body),
    signIn: (body) => client.post<AuthResponse>('/auth/sign-in', body),
    refresh: (body) => client.post<AuthResponse>('/auth/refresh', body),
    me: () => client.get<UserDto>('/me'),
    // DISC-6, DISC-9
    setFavouriteCategories: (body) =>
      client.put<UserDto>('/me/favourite-categories', body),

    // FR-2..4
    searchUsers: (q) =>
      client.get<UserSearchResponse>(`/users/search${query({ q })}`),
    getFriends: () => client.get<FriendsResponse>('/friends'),
    sendFriendRequest: (userId) =>
      client.post<FriendsResponse>('/friends/requests', { userId }),
    acceptRequest: (id) =>
      client.post<FriendsResponse>(
        `/friends/requests/${encodeURIComponent(id)}/accept`,
      ),
    declineRequest: (id) =>
      client.post<FriendsResponse>(
        `/friends/requests/${encodeURIComponent(id)}/decline`,
      ),
    cancelRequest: (id) =>
      client.delete<FriendsResponse>(
        `/friends/requests/${encodeURIComponent(id)}`,
      ),
    removeFriend: (userId) =>
      client.delete<FriendsResponse>(`/friends/${encodeURIComponent(userId)}`),

    // SAVE-3
    listRecipes: () => client.get<RecipeListResponse>('/recipes'),
    // REC-1
    createRecipe: (body) => client.post<RecipeDetailDto>('/recipes', body),
    // REC-4
    getRecipe: (id) =>
      client.get<RecipeDetailDto>(`/recipes/${encodeURIComponent(id)}`),
    // REC-6/7, SAVE-5/6
    updateRecipe: (id, body) =>
      client.put<RecipeDetailDto>(`/recipes/${encodeURIComponent(id)}`, body),
    // REC-2, REC-3, REC-6, REC-8
    setVisibility: (id, body) =>
      client.patch<RecipeDetailDto>(
        `/recipes/${encodeURIComponent(id)}/visibility`,
        body,
      ),
    // REC-6, SAVE-4
    deleteRecipe: (id) =>
      client.delete<void>(`/recipes/${encodeURIComponent(id)}`),
    // SAVE-1, SAVE-4
    saveRecipe: (id) =>
      client.post<RecipeDetailDto>(`/recipes/${encodeURIComponent(id)}/save`),
    // CAT-3, CAT-4, CAT-7
    saveCatalogue: (mealId) =>
      client.post<RecipeDetailDto>(
        `/recipes/catalogue/${encodeURIComponent(mealId)}/save`,
      ),
    // SAVE-10
    syncRecipe: (id) =>
      client.post<RecipeDetailDto>(`/recipes/${encodeURIComponent(id)}/sync`),
    // IMG-3
    uploadImage: (id, file) =>
      client.upload<ImageUploadResponse>(
        `/recipes/${encodeURIComponent(id)}/images`,
        file,
      ),
    // IMG-6
    deleteImage: (id, index) =>
      client.delete<ImageUploadResponse>(
        `/recipes/${encodeURIComponent(id)}/images/${encodeURIComponent(index)}`,
      ),
    // REC-7
    listVersions: (id) =>
      client.get<RecipeVersionsResponse>(
        `/recipes/${encodeURIComponent(id)}/versions`,
      ),
    getVersion: (id, n) =>
      client.get<RecipeDetailDto>(
        `/recipes/${encodeURIComponent(id)}/versions/${encodeURIComponent(n)}`,
      ),

    // NUT-1..6
    getNutrition: (id, mode) =>
      client.get<NutritionResponse>(
        `/recipes/${encodeURIComponent(id)}/nutrition${query({ mode })}`,
      ),

    // DISC-1..9
    discover: (category, page) =>
      client.get<DiscoverResponse>(`/discover${query({ category, page })}`),
    // CAT-2
    cataloguePreview: (mealId) =>
      client.get<CataloguePreviewDto>(
        `/discover/catalogue/${encodeURIComponent(mealId)}`,
      ),

    // RATE-1..4
    rate: (id, stars) =>
      client.put<RatingSummaryDto>(
        `/recipes/${encodeURIComponent(id)}/rating`,
        { stars },
      ),
    getRating: (id) =>
      client.get<RatingSummaryDto>(`/recipes/${encodeURIComponent(id)}/rating`),
    // COM-1..3
    listComments: (id) =>
      client.get<CommentsResponse>(
        `/recipes/${encodeURIComponent(id)}/comments`,
      ),
    postComment: (id, body) =>
      client.post<CommentDto>(
        `/recipes/${encodeURIComponent(id)}/comments`,
        body,
      ),
    deleteComment: (id) =>
      client.delete<void>(`/comments/${encodeURIComponent(id)}`),
    vote: (commentId, value) =>
      client.put<CommentDto>(
        `/comments/${encodeURIComponent(commentId)}/vote`,
        { value },
      ),

    // COOK-1..10
    cookAsk: (body) => client.post<CookAskResponse>('/cook/ask', body),
    cookQuota: () => client.get<QuotaDto>('/cook/quota'),

    // WX-1..10
    recommend: (body) => client.post<RecommendResponse>('/recommend', body),
  };
}

/** The endpoint set bound to the shared client. */
export const endpoints: Endpoints = createEndpoints();

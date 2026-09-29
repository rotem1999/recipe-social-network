// Public surface of @rsn/web/data-access-api (SPEC.md §11.3, §11.5 UI-17).
import './lib/globals';
export {
  ApiClient,
  ApiError,
  apiClient,
  DEFAULT_API_BASE_URL,
} from './lib/client';
export type { HttpMethod } from './lib/client';

export {
  TokenStore,
  tokenStore,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
} from './lib/tokens';
export type { Tokens, TokenListener, Unsubscribe } from './lib/tokens';

export { createEndpoints, endpoints } from './lib/endpoints';
export type { Endpoints } from './lib/endpoints';

export {
  AuthProvider,
  useApi,
  useAuth,
  useRequest,
  useTimezone,
} from './lib/hooks';
export type {
  AuthContextValue,
  AuthProviderProps,
  AuthStatus,
  UseRequestResult,
} from './lib/hooks';

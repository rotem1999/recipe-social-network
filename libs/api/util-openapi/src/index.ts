// SPEC §11.7 (DOC-1..DOC-9): the OpenAPI document, the docs routes and their access rules.
export { setupApiDocs, docsPaths } from './lib/setup-api-docs';
export type { ApiDocsOptions } from './lib/setup-api-docs';
export {
  BEARER_SCHEME_NAME,
  DOCS_DESCRIPTION,
  DOCS_PATH,
  DOCS_TITLE,
  DOCS_VERSION,
  buildDocumentConfig,
  buildSwaggerCustomOptions,
  isProduction,
} from './lib/docs-options';
export {
  DOCS_WWW_AUTHENTICATE,
  MIN_DOCS_PASSWORD_LENGTH,
  createDocsBasicAuth,
  isAuthorized,
  resolveDocsAccess,
} from './lib/docs-access';
export type {
  DocsAccess,
  DocsCredentials,
  DocsEnv,
  DocsMiddleware,
  DocsRequest,
  DocsResponse,
} from './lib/docs-access';
export { ErrorResponseDto } from './lib/error-response.dto';
export { ApiErrorResponses } from './lib/api-error-responses.decorator';
export type { ApiErrorStatus } from './lib/api-error-responses.decorator';

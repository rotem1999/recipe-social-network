// SPEC §11.7: the document header (DOC-2), the bearer scheme (DOC-6) and the
// Swagger UI options per build (DOC-1, DOC-8). Pure values, no Nest application needed.
import { DocumentBuilder } from '@nestjs/swagger';
import type { OpenAPIObject, SwaggerCustomOptions } from '@nestjs/swagger';

/** DOC-1: Swagger UI at `/<API_GLOBAL_PREFIX>/docs`, the JSON document at `…/docs-json`. */
export const DOCS_PATH = 'docs';

/** DOC-2: the document header. */
export const DOCS_TITLE = 'CookBook API';
export const DOCS_VERSION = '1';
export const DOCS_DESCRIPTION =
  'CookBook recipe social network API. Every route except the ones marked public needs a Bearer access token (AUTH-8).';

/**
 * DOC-6: the name of the one HTTP bearer scheme. It is the default name of both
 * `DocumentBuilder.addBearerAuth()` and `@ApiBearerAuth()`.
 */
export const BEARER_SCHEME_NAME = 'bearer';

/** DOC-7: production is `NODE_ENV=production`; anything else is development. */
export function isProduction(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/** DOC-2, DOC-6, DOC-9: header and security scheme only; no server URL, no env value. */
export function buildDocumentConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle(DOCS_TITLE)
    .setVersion(DOCS_VERSION)
    .setDescription(DOCS_DESCRIPTION)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_SCHEME_NAME,
    )
    .build();
}

/**
 * DOC-1, DOC-8: both paths follow the global prefix, only JSON is served, and a pasted
 * token is never kept after a reload. Production turns "Try it out" off for every
 * operation; development keeps the Swagger UI default (on).
 */
export function buildSwaggerCustomOptions(
  production: boolean,
): SwaggerCustomOptions {
  return {
    useGlobalPrefix: true,
    raw: ['json'],
    swaggerOptions: production
      ? { supportedSubmitMethods: [], persistAuthorization: false }
      : { persistAuthorization: false },
  };
}

// SPEC §11.7 DOC-1: builds the OpenAPI document and mounts Swagger UI and the JSON
// document. `apps/api/src/main.ts` calls `setupApiDocs` once, after `setGlobalPrefix`
// and before `listen`.
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { createDocsBasicAuth, resolveDocsAccess } from './docs-access';
import type { DocsEnv } from './docs-access';
import {
  DOCS_PATH,
  buildDocumentConfig,
  buildSwaggerCustomOptions,
  isProduction,
} from './docs-options';

export interface ApiDocsOptions {
  /** The value passed to `app.setGlobalPrefix` (`API_GLOBAL_PREFIX`, §14). */
  globalPrefix: string;
  /** The §14 keys: `NODE_ENV`, `DOCS_USERNAME`, `DOCS_PASSWORD`. */
  env: DocsEnv;
  /** Receives the one DOC-7 startup warning; defaults to a Nest `Logger`. */
  logger?: Pick<Logger, 'warn'>;
}

/**
 * DOC-7: the two docs paths under the global prefix. Express matches `…/docs` together
 * with everything under `…/docs/` (the Swagger UI assets), and `…/docs-json` apart.
 */
export function docsPaths(globalPrefix: string): string[] {
  const prefix = globalPrefix.replace(/^\/+|\/+$/g, '');
  const base = prefix === '' ? `/${DOCS_PATH}` : `/${prefix}/${DOCS_PATH}`;
  return [base, `${base}-json`];
}

/**
 * DOC-1, DOC-7, DOC-8. Returns whether the docs were mounted: in production with an
 * empty key or a short password they are not (both paths answer 404) and one warning
 * naming the key is logged.
 */
export function setupApiDocs(
  app: INestApplication,
  options: ApiDocsOptions,
): boolean {
  const access = resolveDocsAccess(options.env);
  if (access.mode === 'disabled') {
    (options.logger ?? new Logger('ApiDocs')).warn(access.warning);
    return false;
  }
  if (access.mode === 'basic') {
    // Registered before SwaggerModule.setup, so it runs before every docs route.
    app.use(
      docsPaths(options.globalPrefix),
      createDocsBasicAuth(access.credentials),
    );
  }
  const config = buildDocumentConfig();
  SwaggerModule.setup(
    DOCS_PATH,
    app,
    () => SwaggerModule.createDocument(app, config),
    buildSwaggerCustomOptions(isProduction(options.env.NODE_ENV)),
  );
  return true;
}

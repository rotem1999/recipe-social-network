import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

export {
  buildDataSourceOptions,
  MIGRATIONS,
  REQUIRED_DB_ENV_KEYS,
} from './data-source-options';

/**
 * DB-6: the DataSource the TypeORM CLI loads (`-d libs/api/data-access-db/src/data-source.ts`)
 * for `migration:run`, `migration:revert` and `migration:show`.
 *
 * This file is the CLI entry point only; nothing else in the workspace imports it, because
 * building the options reads `process.env` eagerly and throws when a `DB_*` key is missing.
 * Application code imports `DbModule` / `buildDataSourceOptions` from `@rsn/api/data-access-db`.
 */
export default new DataSource(buildDataSourceOptions(process.env));

import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { InitialSchema1759000000000 } from './migrations/1759000000000-InitialSchema';

/**
 * DB-6: migration classes are imported explicitly (no globs) so the DataSource still finds
 * them after webpack has bundled apps/api. New migrations are appended here in order.
 */
export const MIGRATIONS = [InitialSchema1759000000000];

/** DB-2, §14: the only connection settings, all of them environment variables. */
export const REQUIRED_DB_ENV_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

/**
 * DB-2, DB-3: builds the PostgreSQL connection options from the `DB_*` environment
 * variables. `synchronize` and `migrationsRun` are hard-coded false — schema changes go
 * through migrations only, and starting the API never mutates the schema.
 */
export function buildDataSourceOptions(
  env: NodeJS.ProcessEnv,
): DataSourceOptions {
  const missing = REQUIRED_DB_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === '';
  });
  if (missing.length > 0) {
    throw new Error(
      `data-access-db: missing database environment variable(s) ${missing.join(', ')}. ` +
        `Set them in .env.local at the repository root (SPEC.md DB-2, §14).`,
    );
  }

  const port = Number(env['DB_PORT']);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `data-access-db: DB_PORT must be a port number, received "${String(env['DB_PORT'])}".`,
    );
  }

  return {
    type: 'postgres',
    host: env['DB_HOST'],
    port,
    username: env['DB_USERNAME'],
    password: env['DB_PASSWORD'],
    database: env['DB_NAME'],
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    migrationsRun: false,
  };
}

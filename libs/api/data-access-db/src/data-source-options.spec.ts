// SPEC §12 DB-2/DB-3/DB-6: the connection options are built from the five DB_*
// keys, the schema is never synchronised and migrations never run on start.
// The env is passed in explicitly; nothing here reads .env.local.

import 'reflect-metadata';

/**
 * `./index` also exports DbModule, which loads `@nestjs/typeorm` and `@nestjs/config`;
 * both are ESM only and Jest 30 cannot `require` them, so they are replaced at their
 * module boundary (as in the other API specs). Nothing here builds the module.
 */
jest.mock('@nestjs/typeorm', () => ({
  TypeOrmModule: {
    forRoot: () => ({}),
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));

import {
  MIGRATIONS,
  REQUIRED_DB_ENV_KEYS,
  buildDataSourceOptions,
} from './data-source-options';
import { ENTITIES } from './entities';
import { InitialSchema1759000000000 } from './migrations/1759000000000-InitialSchema';
import { SaveOwnership1759100000000 } from './migrations/1759100000000-SaveOwnership';
import { SharedWithNobodyPrivate1759200000000 } from './migrations/1759200000000-SharedWithNobodyPrivate';
import {
  SaveOwnership1759100000000 as SaveOwnershipFromIndex,
  SharedWithNobodyPrivate1759200000000 as SharedWithNobodyPrivateFromIndex,
} from './index';

function validEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'cookbook',
    DB_PASSWORD: 'cookbook-password',
    DB_NAME: 'cookbook',
    ...overrides,
  };
}

describe('buildDataSourceOptions', () => {
  it('DB-2 reads host, port, username, password and database from the env', () => {
    const options = buildDataSourceOptions(
      validEnv({ DB_HOST: 'db.internal', DB_PORT: '6432' }),
    );

    expect(options).toMatchObject({
      type: 'postgres',
      host: 'db.internal',
      port: 6432,
      username: 'cookbook',
      password: 'cookbook-password',
      database: 'cookbook',
    });
  });

  it('DB-2 lists exactly the five required keys', () => {
    expect([...REQUIRED_DB_ENV_KEYS]).toEqual([
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_NAME',
    ]);
  });

  it('DB-3 never synchronises the schema and never runs migrations on start', () => {
    const options = buildDataSourceOptions(validEnv());

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('DB-6 lists the entities and the migrations explicitly, with no glob', () => {
    const options = buildDataSourceOptions(validEnv()) as unknown as {
      entities: unknown;
      migrations: unknown;
    };

    expect(options.entities).toBe(ENTITIES);
    expect(options.migrations).toBe(MIGRATIONS);
    expect(Array.isArray(options.entities)).toBe(true);
    expect(
      (options.entities as unknown[]).every((entry) => typeof entry !== 'string'),
    ).toBe(true);
  });

  it('DB-2 throws naming every missing key', () => {
    expect(() =>
      buildDataSourceOptions({ DB_HOST: 'localhost', DB_PORT: '5432' }),
    ).toThrow(/DB_USERNAME, DB_PASSWORD, DB_NAME/);
  });

  it('DB-2 names only the key that is missing', () => {
    expect(() =>
      buildDataSourceOptions(validEnv({ DB_PASSWORD: undefined })),
    ).toThrow(/missing database environment variable\(s\) DB_PASSWORD\./);
  });

  it('DB-2 treats a blank value as missing', () => {
    expect(() => buildDataSourceOptions(validEnv({ DB_NAME: '   ' }))).toThrow(
      /DB_NAME/,
    );
  });

  it('DB-2 points at .env.local rather than leaking a value in the message', () => {
    let message = '';
    try {
      buildDataSourceOptions(validEnv({ DB_HOST: '' }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('.env.local');
    expect(message).not.toContain('cookbook-password');
  });

  it('DB-2 rejects a DB_PORT that is not a port number', () => {
    for (const port of ['not-a-number', '0', '65536', '5432.5']) {
      expect(() => buildDataSourceOptions(validEnv({ DB_PORT: port }))).toThrow(
        /DB_PORT must be a port number/,
      );
    }
  });
});

describe('MIGRATIONS', () => {
  it('DB-6 exports the initial schema migration as the first migration', () => {
    expect(MIGRATIONS[0]).toBe(InitialSchema1759000000000);
  });

  it('DB-6, §12.1, FR-4 appends SaveOwnership and then SharedWithNobodyPrivate after the initial schema, in timestamp order', () => {
    expect(MIGRATIONS).toEqual([
      InitialSchema1759000000000,
      SaveOwnership1759100000000,
      SharedWithNobodyPrivate1759200000000,
    ]);
  });

  it('DB-6 re-exports SaveOwnership from the library entry point', () => {
    expect(SaveOwnershipFromIndex).toBe(SaveOwnership1759100000000);
  });

  it('DB-6, FR-4 re-exports SharedWithNobodyPrivate from the library entry point', () => {
    expect(SharedWithNobodyPrivateFromIndex).toBe(
      SharedWithNobodyPrivate1759200000000,
    );
  });

  it('DB-3 still never synchronises the schema with the third migration listed', () => {
    const options = buildDataSourceOptions(validEnv());

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(
      (options as unknown as { migrations: unknown[] }).migrations,
    ).toContain(SharedWithNobodyPrivate1759200000000);
  });

  it('DB-6 keeps the SaveOwnership timestamp in the class name and in the `name` property', () => {
    expect(SaveOwnership1759100000000.name).toBe('SaveOwnership1759100000000');
    expect(new SaveOwnership1759100000000().name).toBe(
      'SaveOwnership1759100000000',
    );
  });

  it('DB-6 keeps the timestamp in the class name and in the `name` property', () => {
    expect(InitialSchema1759000000000.name).toBe('InitialSchema1759000000000');
    expect(new InitialSchema1759000000000().name).toBe(
      'InitialSchema1759000000000',
    );
    expect(/^[A-Za-z]+1759000000000$/.test(InitialSchema1759000000000.name)).toBe(
      true,
    );
  });
});

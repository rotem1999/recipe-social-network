// SPEC §12 DB-6: at boot the API asks the DataSource whether migrations are pending and logs
// an error when some are; it still starts and never runs a migration itself (DB-3, DB-6).
// The DataSource is a mock: no database is touched.
import 'reflect-metadata';

/**
 * `./data-access-db.module` loads `@nestjs/typeorm` and `@nestjs/config`; both are ESM only
 * and Jest 30 cannot `require` them, so they are replaced at their module boundary (as in the
 * other API specs). The module is only inspected for its metadata, never built.
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

import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DbModule } from './data-access-db.module';
import {
  MigrationCheckService,
  SCHEMA_OUT_OF_DATE_MESSAGE,
} from './migration-check.service';
import {
  MigrationCheckService as MigrationCheckServiceFromIndex,
  SCHEMA_OUT_OF_DATE_MESSAGE as MessageFromIndex,
} from '../index';

interface DataSourceFake {
  showMigrations: jest.Mock;
  runMigrations: jest.Mock;
  undoLastMigration: jest.Mock;
  synchronize: jest.Mock;
}

function dataSource(showMigrations: jest.Mock): DataSourceFake {
  return {
    showMigrations,
    runMigrations: jest.fn(),
    undoLastMigration: jest.fn(),
    synchronize: jest.fn(),
  };
}

function service(fake: DataSourceFake): MigrationCheckService {
  return new MigrationCheckService(fake as unknown as DataSource);
}

describe('MigrationCheckService', () => {
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('DB-6 words the message exactly as SPEC.md does', () => {
    expect(SCHEMA_OUT_OF_DATE_MESSAGE).toBe(
      'Database schema is out of date: run pnpm nx run api-data-access-db:migrate',
    );
  });

  it('DB-6 logs the out-of-date error once when migrations are pending', async () => {
    const fake = dataSource(jest.fn().mockResolvedValue(true));

    await expect(service(fake).onApplicationBootstrap()).resolves.toBeUndefined();

    expect(fake.showMigrations).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Database schema is out of date: run pnpm nx run api-data-access-db:migrate',
    );
  });

  it('DB-6 logs nothing when no migration is pending', async () => {
    const fake = dataSource(jest.fn().mockResolvedValue(false));

    await expect(service(fake).onApplicationBootstrap()).resolves.toBeUndefined();

    expect(fake.showMigrations).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('DB-6 logs an error and does not throw when the check itself fails', async () => {
    const fake = dataSource(
      jest.fn().mockRejectedValue(new Error('connection terminated')),
    );

    await expect(service(fake).onApplicationBootstrap()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    const [message] = error.mock.calls[0] as [string];
    expect(message).toContain('connection terminated');
    // A failed check is not reported as a schema that is out of date.
    expect(message).not.toBe(SCHEMA_OUT_OF_DATE_MESSAGE);
  });

  it('DB-6 does not throw when the check fails with a value that is not an Error', async () => {
    const fake = dataSource(jest.fn().mockRejectedValue('socket hang up'));

    await expect(service(fake).onApplicationBootstrap()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('socket hang up');
  });

  it.each([
    ['pending migrations', () => jest.fn().mockResolvedValue(true)],
    ['no pending migrations', () => jest.fn().mockResolvedValue(false)],
    ['a failed check', () => jest.fn().mockRejectedValue(new Error('boom'))],
  ])(
    'DB-3, DB-6 never runs, reverts or synchronises anything at boot (%s)',
    async (_name, showMigrations) => {
      const fake = dataSource(showMigrations());

      await service(fake).onApplicationBootstrap();

      expect(fake.runMigrations).not.toHaveBeenCalled();
      expect(fake.undoLastMigration).not.toHaveBeenCalled();
      expect(fake.synchronize).not.toHaveBeenCalled();
    },
  );

  it('DB-6 is registered as a provider of DbModule, so the check runs whenever the API boots', () => {
    const providers = Reflect.getMetadata('providers', DbModule) as unknown[];

    expect(providers).toContain(MigrationCheckService);
  });

  it('DB-6 exports the service and the message from the library entry point', () => {
    expect(MigrationCheckServiceFromIndex).toBe(MigrationCheckService);
    expect(MessageFromIndex).toBe(SCHEMA_OUT_OF_DATE_MESSAGE);
  });
});

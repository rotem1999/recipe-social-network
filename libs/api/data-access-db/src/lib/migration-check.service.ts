import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** DB-6: the exact error the API logs when the schema lags behind the code. */
export const SCHEMA_OUT_OF_DATE_MESSAGE =
  'Database schema is out of date: run pnpm nx run api-data-access-db:migrate';

/**
 * DB-6 (QOL-013): at boot, asks the DataSource whether any registered migration is still
 * pending and logs an error when one is. The API still starts; `migrationsRun` stays false,
 * so nothing here runs a migration.
 */
@Injectable()
export class MigrationCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationCheckService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      if (await this.dataSource.showMigrations()) {
        this.logger.error(SCHEMA_OUT_OF_DATE_MESSAGE);
      }
    } catch (error) {
      this.logger.error(
        `Could not check for pending migrations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

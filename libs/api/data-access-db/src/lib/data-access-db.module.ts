import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  buildDataSourceOptions,
  REQUIRED_DB_ENV_KEYS,
} from '../data-source-options';
import { ENTITIES } from '../entities';

/**
 * DB-2: reads the `DB_*` keys through `ConfigService` (ConfigModule.forRoot({ isGlobal: true })
 * lives in apps/api) and hands them to the same builder the TypeORM CLI uses.
 */
function dbEnvFromConfig(configService: ConfigService): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of REQUIRED_DB_ENV_KEYS) {
    const value = configService.get<string | number>(key);
    if (value !== undefined && value !== null) {
      env[key] = String(value);
    }
  }
  return env;
}

/**
 * DB-1, DB-4: the single PostgreSQL connection of the backend. Importing this module both
 * opens the connection and re-exports repositories for every §12.1 entity, so a feature
 * library only needs `imports: [DbModule]` to use `@InjectRepository(RecipeEntity)`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        ...buildDataSourceOptions(dbEnvFromConfig(configService)),
        // DB-3: entities are listed explicitly; nothing is discovered by glob.
        autoLoadEntities: false,
      }),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DbModule {}

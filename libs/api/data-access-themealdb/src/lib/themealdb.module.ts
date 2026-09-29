// §3.3, §11.3: the TheMealDB data-access module. ConfigModule.forRoot({ isGlobal: true })
// lives in apps/api; this module only injects ConfigService (libs/api/CLAUDE.md).

import { Module } from '@nestjs/common';
import { TheMealDbMapper } from './themealdb.mapper';
import { TheMealDbService } from './themealdb.service';

@Module({
  providers: [TheMealDbService, TheMealDbMapper],
  exports: [TheMealDbService, TheMealDbMapper],
})
export class TheMealDbModule {}

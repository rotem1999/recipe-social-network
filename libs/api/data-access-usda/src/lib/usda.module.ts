import { Module } from '@nestjs/common';

import { UsdaService } from './usda.service';

/** SPEC §9 NUT-2: the FoodData Central client, injected by feature-nutrition. */
@Module({
  providers: [UsdaService],
  exports: [UsdaService],
})
export class UsdaModule {}

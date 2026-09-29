import { Module } from '@nestjs/common';

import { UsdaModule } from '@rsn/api/data-access-usda';
import { AuthModule } from '@rsn/api/feature-auth';
import { RecipesModule } from '@rsn/api/feature-recipes';

import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';

/** SPEC §9 NUT-1..NUT-10: calories per portion from USDA FoodData Central. */
@Module({
  imports: [AuthModule, RecipesModule, UsdaModule],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}

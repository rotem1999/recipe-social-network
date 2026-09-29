import { Module } from '@nestjs/common';
import { OpenRouterModule } from '@rsn/api/data-access-openrouter';
import { WeatherModule } from '@rsn/api/data-access-weather';
import { AuthModule } from '@rsn/api/feature-auth';
import { CookModule } from '@rsn/api/feature-cook';
import { RecipesModule } from '@rsn/api/feature-recipes';

import { RecommendController } from './recommend.controller';
import { RecommendPromptBuilder } from './recommend-prompt.builder';
import { RecommendService } from './recommend.service';
import { WeatherLineBuilder } from './weather-line.builder';

/**
 * SPEC §8 (WX-1..WX-10): recommendations. RecipesModule supplies the
 * candidates, CookModule the shared daily AI quota (COOK-8), WeatherModule the
 * Open-Meteo context (WX-7) and OpenRouterModule the ranking call (WX-3).
 */
@Module({
  imports: [
    AuthModule,
    RecipesModule,
    CookModule,
    WeatherModule,
    OpenRouterModule,
  ],
  controllers: [RecommendController],
  providers: [RecommendService, RecommendPromptBuilder, WeatherLineBuilder],
  exports: [RecommendService],
})
export class RecommendModule {}

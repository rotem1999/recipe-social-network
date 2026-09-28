import { Module } from '@nestjs/common';
import { DbModule } from '@rsn/api/data-access-db';
import { AuthModule } from '@rsn/api/feature-auth';
import { RecipesModule } from '@rsn/api/feature-recipes';
import { OpenRouterModule } from '@rsn/api/data-access-openrouter';
import { AiQuotaService } from './ai-quota.service';
import { CookController } from './cook.controller';
import { CookPromptBuilder } from './cook-prompt.builder';
import { CookService } from './cook.service';

/**
 * §7 cook mode. `AiQuotaService` is exported because COOK-8 counts cook mode and
 * recommendations against the same daily budget (feature-recommend consumes it).
 */
@Module({
  imports: [DbModule, AuthModule, RecipesModule, OpenRouterModule],
  controllers: [CookController],
  providers: [AiQuotaService, CookPromptBuilder, CookService],
  exports: [AiQuotaService],
})
export class CookModule {}

import { Module } from '@nestjs/common';
import { OpenRouterService } from './openrouter.service';
import { PromptLogService } from './prompt-log.service';

/**
 * COOK-6: the backend's only OpenRouter client, plus the prompt log (§10).
 * `ConfigModule.forRoot({ isGlobal: true })` lives in apps/api, so
 * `ConfigService` is injected without importing anything here.
 */
@Module({
  providers: [OpenRouterService, PromptLogService],
  exports: [OpenRouterService, PromptLogService],
})
export class OpenRouterModule {}

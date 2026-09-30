// §7 cook mode and the AI assistant (COOK-1..COOK-10).
export { CookModule } from './lib/cook.module';
export { CookController } from './lib/cook.controller';
export { CookService } from './lib/cook.service';
export { AiQuotaService } from './lib/ai-quota.service';
export { CookPromptBuilder } from './lib/cook-prompt.builder';
export type { CookPromptInput } from './lib/cook-prompt.builder';
export { CookAskDto } from './lib/dto/cook-ask.dto';
export {
  CookAskResponseDto,
  QuotaExceededResponseDto,
  QuotaResponseDto,
} from './lib/dto/cook-response.dto';

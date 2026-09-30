import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthUser } from '@rsn/api/feature-auth';
import { RecipeAccessService } from '@rsn/api/feature-recipes';
import { OpenRouterService } from '@rsn/api/data-access-openrouter';
import type {
  CookAskRequest,
  CookAskResponse,
  QuotaDto,
} from '@rsn/shared/util-contracts';
import { AiQuotaService } from './ai-quota.service';
import { CookPromptBuilder } from './cook-prompt.builder';

/**
 * COOK-10: one answer is at most 1500 tokens (300 until 2026-09-30: the model
 * spends most completion tokens on reasoning that is not returned), at a low
 * temperature.
 */
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.4;

/** COOK-10: the 503 message when the model returns no text. */
const NO_ANSWER_MESSAGE = "The assistant didn't answer. Ask again.";

/**
 * COOK-1/COOK-2: one stateless question about one step of a recipe the caller may cook.
 * Order of checks is fixed by COOK-10: access, then step, then quota, then the call.
 */
@Injectable()
export class CookService {
  constructor(
    private readonly access: RecipeAccessService,
    private readonly quota: AiQuotaService,
    private readonly prompts: CookPromptBuilder,
    private readonly openRouter: OpenRouterService,
  ) {}

  /** COOK-10: `POST /cook/ask`. */
  async ask(user: AuthUser, body: CookAskRequest): Promise<CookAskResponse> {
    // COOK-5: owned, saved and shared recipes only (403 otherwise).
    const recipe = await this.access.loadOrThrow(body.recipeId);
    await this.access.assertCanCook(user.id, recipe);

    const version = recipe.currentVersion;
    if (version === undefined || version === null) {
      throw new NotFoundException('Recipe has no current version');
    }
    // COOK-1: the step being cooked has to exist in the version on screen.
    if (body.stepIndex >= version.steps.length) {
      throw new BadRequestException('stepIndex is outside the recipe steps');
    }

    // COOK-8: counted server-side before the call is made; 429 when exhausted.
    const quota = await this.quota.consume(user.id);

    // COOK-4/COOK-9: the whole context travels in this one request.
    const messages = this.prompts.build({
      title: version.title,
      servings: version.servings,
      ingredients: version.ingredients,
      steps: version.steps,
      stepIndex: body.stepIndex,
      question: body.question,
    });

    const result = await this.openRouter.chat({
      feature: 'cook',
      userId: user.id,
      messages,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });

    // COOK-10: an answer with no text is a 503; the call is already logged
    // by OpenRouterService (LOG-5) and the quota unit stays spent (COOK-8).
    const answer = result.text.trim();
    if (answer === '') {
      throw new ServiceUnavailableException(NO_ANSWER_MESSAGE);
    }

    // COOK-10: the text, the tokens and the cost go back to the client.
    return {
      answer,
      quota,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      cost: result.cost,
    };
  }

  /** COOK-10: `GET /cook/quota` — today's counts, UTC. */
  quotaFor(user: AuthUser): Promise<QuotaDto> {
    return this.quota.current(user.id);
  }
}

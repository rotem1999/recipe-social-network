import { Injectable } from '@nestjs/common';
import {
  extractJsonObject,
  OpenRouterService,
} from '@rsn/api/data-access-openrouter';
import type { WeatherSnapshot } from '@rsn/api/data-access-weather';
import { WeatherService } from '@rsn/api/data-access-weather';
import type { AuthUser } from '@rsn/api/feature-auth';
import { AiQuotaService } from '@rsn/api/feature-cook';
import { RecipeDtoService, RecipesService } from '@rsn/api/feature-recipes';
import type {
  RecipeCardDto,
  RecommendationDto,
  RecommendRequest,
  RecommendResponse,
  RecommendScope,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';
import { totalMinutes } from '@rsn/shared/util-domain';

import { MAX_PICKS, RecommendPromptBuilder } from './recommend-prompt.builder';
import { WeatherLineBuilder } from './weather-line.builder';

/** WX-10: at most 30 candidates are sent to the model. */
const MAX_CANDIDATES = 30;

/** WX-10: one OpenRouter call per recommendation. */
const MAX_TOKENS = 400;
const TEMPERATURE = 0.5;

/** The pick objects the model is asked for (WX-10); every field is unverified. */
interface RawPick {
  id?: unknown;
  reason?: unknown;
}

/**
 * SPEC §8 (WX-1..WX-10): weather- and time-based recommendations. Candidates
 * come from feature-recipes, the weather from Open-Meteo (WX-7/WX-8) and the
 * ranking from OpenRouter (WX-3), counted against the daily AI quota (COOK-8).
 */
@Injectable()
export class RecommendService {
  constructor(
    private readonly recipes: RecipesService,
    private readonly recipeDto: RecipeDtoService,
    private readonly weather: WeatherService,
    private readonly quota: AiQuotaService,
    private readonly openRouter: OpenRouterService,
    private readonly prompt: RecommendPromptBuilder,
    private readonly weatherLine: WeatherLineBuilder,
  ) {}

  /** WX-10: `POST /recommend`. */
  async recommend(
    user: AuthUser,
    body: RecommendRequest,
  ): Promise<RecommendResponse> {
    // WX-5: "view next" re-prompts without the recipes already shown.
    const excluded = new Set(body.excludeRecipeIds ?? []);
    const candidates = await this.candidatesFor(user.id, body.scope, excluded);

    // WX-10: a city Open-Meteo cannot geocode still yields a recommendation,
    // without weather context and without a weather line.
    const snapshot = await this.weather.weatherFor(body.timezone);
    const weather = snapshot === null ? null : this.toContext(snapshot);

    // Nothing to rank: no model call, so no quota is spent (COOK-8).
    if (candidates.length === 0) {
      return { picks: [], weather, quota: await this.quota.current(user.id) };
    }

    // COOK-8: counted server-side before the call; 429 propagates to the client.
    const quota = await this.quota.consume(user.id);

    const messages = this.prompt.build({
      scope: body.scope,
      weather: snapshot,
      candidates: candidates.map((card) => ({
        id: card.id,
        title: card.title,
        category: card.category,
        minutes: totalMinutes(card),
      })),
    });

    // WX-6: OpenRouterService logs every prompt and response (§10).
    const result = await this.openRouter.chat({
      feature: 'recommend',
      userId: user.id,
      messages,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });

    return {
      picks: this.picksFrom(result.text, candidates, body.scope),
      weather,
      quota,
    };
  }

  /**
   * WX-10: for `home` the caller's own and saved recipes (WX-4), for
   * `discover` the newest public ones; minus the excluded ids, at most 30.
   */
  private async candidatesFor(
    userId: string,
    scope: RecommendScope,
    excluded: Set<string>,
  ): Promise<RecipeCardDto[]> {
    if (scope === 'discover') {
      const { cards } = await this.recipeDto.listPublicCards(userId, {
        page: 1,
        pageSize: MAX_CANDIDATES,
        excludeIds: [...excluded],
      });
      return cards.filter((card) => !excluded.has(card.id));
    }

    const mine = await this.recipes.candidatesForRecommend(userId);
    const kept = mine
      .filter((recipe) => !excluded.has(recipe.id))
      .slice(0, MAX_CANDIDATES);
    return this.recipeDto.cardsFor(userId, kept);
  }

  /**
   * WX-10: keep the picks whose id is in the candidate list, at most 3 (home)
   * or 1 (discover). A non-JSON answer yields an empty list and the client
   * shows "No recommendation right now".
   */
  private picksFrom(
    text: string,
    candidates: RecipeCardDto[],
    scope: RecommendScope,
  ): RecommendationDto[] {
    const byId = new Map(candidates.map((card) => [card.id, card]));
    const picks: RecommendationDto[] = [];

    for (const raw of rawPicks(extractJsonObject(text))) {
      if (picks.length >= MAX_PICKS[scope]) break;
      if (typeof raw.id !== 'string') continue;

      const recipe = byId.get(raw.id);
      // An invented id, or the same recipe twice, is dropped.
      if (recipe === undefined) continue;
      byId.delete(raw.id);

      picks.push({
        recipe,
        reason: typeof raw.reason === 'string' ? raw.reason.trim() : '',
      });
    }

    return picks;
  }

  /** WX-10: the weather context returned with the response (WX-2 greeting line). */
  private toContext(snapshot: WeatherSnapshot): WeatherContextDto {
    return {
      city: snapshot.city,
      temperatureC: snapshot.temperatureC,
      isDay: snapshot.isDay,
      condition: snapshot.condition,
      localHour: snapshot.localHour,
      line: this.weatherLine.line(snapshot),
    };
  }
}

/** WX-10: the `picks` array of the model's answer, or nothing usable. */
function rawPicks(parsed: unknown): RawPick[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const picks = (parsed as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks.filter(
    (entry): entry is RawPick => entry !== null && typeof entry === 'object',
  );
}

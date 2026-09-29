// SPEC §8 WX-3..WX-10 and COOK-8. Every collaborator is a hand-written fake:
// no database, no network, no OpenRouter key.
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecipeEntity } from '@rsn/api/data-access-db';
import type { OpenRouterService } from '@rsn/api/data-access-openrouter';
import type {
  WeatherService,
  WeatherSnapshot,
} from '@rsn/api/data-access-weather';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { AiQuotaService } from '@rsn/api/feature-cook';
import type {
  RecipeDtoService,
  RecipesService,
} from '@rsn/api/feature-recipes';
import type { RecipeCardDto } from '@rsn/shared/util-contracts';

import { RecommendPromptBuilder } from './recommend-prompt.builder';
import { RecommendService } from './recommend.service';
import { WeatherLineBuilder } from './weather-line.builder';

/**
 * `@nestjs/typeorm` 12.0.2, `@nestjs/jwt` 12.0.2 and `@nestjs/config` 5.x are published as
 * ESM only (`"type": "module"`, no CommonJS build), which Jest 30 cannot `require`. These
 * tests use plain constructor injection, so those packages are replaced at their module
 * boundary by the decorators and module helpers the files under test touch when loaded.
 */
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
  getRepositoryToken: (entity: { name: string }) => `${entity.name}Repository`,
  TypeOrmModule: {
    forRoot: () => ({}),
    forRootAsync: () => ({}),
    forFeature: () => ({}),
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class JwtService {},
  JwtModule: { register: () => ({}), registerAsync: () => ({}) },
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const USER: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'rotem',
};

const SNAPSHOT: WeatherSnapshot = {
  city: 'Tel Aviv',
  temperatureC: 8.6,
  isDay: false,
  condition: 'clear',
  weatherCode: 0,
  localHour: 21,
};

const QUOTA = { used: 3, limit: 100, remaining: 97 };

function card(id: string, title = `Recipe ${id}`): RecipeCardDto {
  return {
    id,
    title,
    category: 'Pasta',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 35,
    visibility: 'public',
    relation: 'own',
    ownerUsername: 'rotem',
    source: 'user',
    imageUrl: null,
    rating: null,
    versionNumber: 1,
    updatedAt: '2026-09-20T08:00:00.000Z',
    myCopyId: null,
    updateAvailable: false,
  };
}

interface Harness {
  service: RecommendService;
  recipes: { candidatesForRecommend: jest.Mock };
  recipeDto: { listPublicCards: jest.Mock; cardsFor: jest.Mock };
  weather: { weatherFor: jest.Mock };
  quota: { consume: jest.Mock; current: jest.Mock };
  openRouter: { chat: jest.Mock };
  calls: string[];
}

function makeHarness(answer = '{"picks":[]}'): Harness {
  const calls: string[] = [];

  const recipes = { candidatesForRecommend: jest.fn().mockResolvedValue([]) };
  const recipeDto = {
    listPublicCards: jest.fn().mockResolvedValue({ cards: [], hasMore: false }),
    // Mirrors the real service: one card per entity handed in.
    cardsFor: jest.fn(async (_userId: string, rows: RecipeEntity[]) =>
      rows.map((row) => card(row.id)),
    ),
  };
  const weather = { weatherFor: jest.fn().mockResolvedValue(SNAPSHOT) };
  const quota = {
    consume: jest.fn(async () => {
      calls.push('consume');
      return QUOTA;
    }),
    current: jest.fn(async () => {
      calls.push('current');
      return QUOTA;
    }),
  };
  const openRouter = {
    chat: jest.fn(async () => {
      calls.push('chat');
      return {
        text: answer,
        model: 'minimax/minimax-m3',
        promptTokens: 320,
        completionTokens: 60,
        totalTokens: 380,
        cost: 0.00021,
        generationId: 'gen-xyz',
        latencyMs: 700,
      };
    }),
  };

  const service = new RecommendService(
    recipes as unknown as RecipesService,
    recipeDto as unknown as RecipeDtoService,
    weather as unknown as WeatherService,
    quota as unknown as AiQuotaService,
    openRouter as unknown as OpenRouterService,
    new RecommendPromptBuilder(),
    new WeatherLineBuilder(),
  );

  return { service, recipes, recipeDto, weather, quota, openRouter, calls };
}

function entities(...ids: string[]): RecipeEntity[] {
  return ids.map((id) => ({ id }) as RecipeEntity);
}

describe('RecommendService.recommend (WX-5, WX-10, COOK-8)', () => {
  it('WX-10 returns empty picks without spending quota when there is nothing to rank', async () => {
    const harness = makeHarness();

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks).toEqual([]);
    expect(response.quota).toEqual(QUOTA);
    expect(harness.quota.consume).not.toHaveBeenCalled();
    expect(harness.openRouter.chat).not.toHaveBeenCalled();
    expect(harness.calls).toEqual(['current']);
  });

  it('COOK-8 consumes the quota before the model call when there are candidates', async () => {
    const harness = makeHarness('{"picks":[]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(harness.calls).toEqual(['consume', 'chat']);
  });

  it('WX-10 sends one recommend-feature request with max_tokens 1500 and temperature 0.5', async () => {
    const harness = makeHarness('{"picks":[]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    const [input] = harness.openRouter.chat.mock.calls[0];
    expect(input.feature).toBe('recommend');
    expect(input.userId).toBe(USER.id);
    expect(input.maxTokens).toBe(1500);
    expect(input.temperature).toBe(0.5);
  });

  it('WX-10 keeps only picks whose id is in the candidate list', async () => {
    const harness = makeHarness(
      '{"picks":[{"id":"invented","reason":"no"},{"id":"a","reason":"  warm and quick  "}]}',
    );
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a', 'b'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks).toHaveLength(1);
    expect(response.picks[0].recipe.id).toBe('a');
    expect(response.picks[0].reason).toBe('warm and quick');
  });

  it('WX-4 caps the personal space at 3 picks', async () => {
    const harness = makeHarness(
      '{"picks":[{"id":"a","reason":"1"},{"id":"b","reason":"2"},{"id":"c","reason":"3"},{"id":"d","reason":"4"}]}',
    );
    harness.recipes.candidatesForRecommend.mockResolvedValue(
      entities('a', 'b', 'c', 'd'),
    );

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks.map((pick) => pick.recipe.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('WX-10 caps Discover at 1 pick', async () => {
    const harness = makeHarness(
      '{"picks":[{"id":"a","reason":"1"},{"id":"b","reason":"2"}]}',
    );
    harness.recipeDto.listPublicCards.mockResolvedValue({
      cards: [card('a'), card('b')],
      hasMore: false,
    });

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'discover',
    });

    expect(response.picks.map((pick) => pick.recipe.id)).toEqual(['a']);
  });

  it('WX-10 drops the same recipe picked twice', async () => {
    const harness = makeHarness(
      '{"picks":[{"id":"a","reason":"1"},{"id":"a","reason":"again"},{"id":"b","reason":"2"}]}',
    );
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a', 'b'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks.map((pick) => pick.recipe.id)).toEqual(['a', 'b']);
  });

  it('WX-10 yields empty picks for an answer that is not JSON', async () => {
    const harness = makeHarness('No recommendation right now, sorry.');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks).toEqual([]);
    expect(response.quota).toEqual(QUOTA);
  });

  it('WX-10 yields empty picks when the JSON carries no picks array', async () => {
    const harness = makeHarness('{"answer":"I would cook ramen"}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks).toEqual([]);
  });

  it('WX-5 removes the already-recommended ids from the personal candidates', async () => {
    const harness = makeHarness('{"picks":[{"id":"b","reason":"next"}]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a', 'b'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
      excludeRecipeIds: ['a'],
    });

    expect(harness.recipeDto.cardsFor).toHaveBeenCalledWith(USER.id, [
      expect.objectContaining({ id: 'b' }),
    ]);
    expect(response.picks.map((pick) => pick.recipe.id)).toEqual(['b']);
  });

  it('WX-5 removes the already-recommended ids from the Discover candidates', async () => {
    const harness = makeHarness('{"picks":[{"id":"b","reason":"next"}]}');
    harness.recipeDto.listPublicCards.mockResolvedValue({
      cards: [card('a'), card('b')],
      hasMore: false,
    });

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'discover',
      excludeRecipeIds: ['a'],
    });

    expect(harness.recipeDto.listPublicCards).toHaveBeenCalledWith(USER.id, {
      page: 1,
      pageSize: 30,
      excludeIds: ['a'],
    });
    expect(response.picks.map((pick) => pick.recipe.id)).toEqual(['b']);
  });

  it('WX-10 sends at most 30 candidates to the model', async () => {
    const ids = Array.from({ length: 42 }, (_, index) => `r${index}`);
    const harness = makeHarness('{"picks":[]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities(...ids));

    await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    const [, rows] = harness.recipeDto.cardsFor.mock.calls[0];
    expect(rows).toHaveLength(30);
    const userMessage = harness.openRouter.chat.mock.calls[0][0].messages[1]
      .content as string;
    expect(userMessage.split('\n')).toHaveLength(32); // weather + header + 30
  });

  it('WX-2 maps the snapshot to the weather context with the greeting line', async () => {
    const harness = makeHarness('{"picks":[]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(harness.weather.weatherFor).toHaveBeenCalledWith('Asia/Jerusalem');
    expect(response.weather).toEqual({
      city: 'Tel Aviv',
      temperatureC: 8.6,
      isDay: false,
      condition: 'clear',
      localHour: 21,
      line: '9 °C and clear tonight in Tel Aviv',
    });
  });

  it('WX-10 still recommends, without weather, for a city Open-Meteo cannot geocode', async () => {
    const harness = makeHarness('{"picks":[{"id":"a","reason":"comfort food"}]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));
    harness.weather.weatherFor.mockResolvedValue(null);

    const response = await harness.service.recommend(USER, {
      timezone: 'Mars/Olympus_Mons',
      scope: 'home',
    });

    expect(response.weather).toBeNull();
    expect(response.picks).toHaveLength(1);
    const userMessage = harness.openRouter.chat.mock.calls[0][0].messages[1]
      .content as string;
    expect(userMessage.split('\n')[0]).toBe('Weather unknown');
  });

  it('WX-10 reports an empty reason when the model omitted one', async () => {
    const harness = makeHarness('{"picks":[{"id":"a"}]}');
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));

    const response = await harness.service.recommend(USER, {
      timezone: 'Asia/Jerusalem',
      scope: 'home',
    });

    expect(response.picks[0].reason).toBe('');
  });

  it('§11.6 an OpenRouter failure reaches the client as the neutral 503', async () => {
    const harness = makeHarness();
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a'));
    harness.openRouter.chat.mockRejectedValue(
      new ServiceUnavailableException('The assistant is unavailable right now'),
    );

    const error = await harness.service
      .recommend(USER, { timezone: 'Asia/Jerusalem', scope: 'home' })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).message).toBe(
      'The assistant is unavailable right now',
    );
  });
});

describe('RecommendService.recommend cache (WX-10)', () => {
  /** 10:10 local time in Asia/Jerusalem (UTC+3 on this date). */
  const T0 = new Date('2026-09-30T07:10:00.000Z');
  const MINUTE = 60 * 1000;
  const HOME = { timezone: 'Asia/Jerusalem', scope: 'home' as const };

  function chatResult(text: string) {
    return {
      text,
      model: 'minimax/minimax-m3',
      promptTokens: 320,
      completionTokens: 60,
      totalTokens: 380,
      cost: 0.00021,
      generationId: 'gen-xyz',
      latencyMs: 700,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(T0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function homeHarness(answer = '{"picks":[{"id":"a","reason":"warming"}]}') {
    const harness = makeHarness(answer);
    harness.recipes.candidatesForRecommend.mockResolvedValue(entities('a', 'b'));
    return harness;
  }

  it('WX-10 answers a second identical request from the cache without a model call', async () => {
    const harness = homeHarness();

    const first = await harness.service.recommend(USER, HOME);
    const second = await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
    expect(second.picks).toEqual(first.picks);
    expect(second.picks.map((pick) => [pick.recipe.id, pick.reason])).toEqual([
      ['a', 'warming'],
    ]);
  });

  it('COOK-8 a cache hit counts no quota unit and reads the current quota instead', async () => {
    const harness = homeHarness();

    await harness.service.recommend(USER, HOME);
    harness.calls.length = 0;
    await harness.service.recommend(USER, HOME);

    expect(harness.quota.consume).toHaveBeenCalledTimes(1);
    expect(harness.calls).toEqual(['current']);
  });

  it('COOK-8 a cache hit still answers when the daily quota is exhausted', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);
    harness.quota.consume.mockRejectedValue(
      new HttpException('Daily AI quota reached', HttpStatus.TOO_MANY_REQUESTS),
    );
    const exhausted = { used: 100, limit: 100, remaining: 0 };
    harness.quota.current.mockResolvedValue(exhausted);

    const response = await harness.service.recommend(USER, HOME);

    expect(response.picks.map((pick) => pick.recipe.id)).toEqual(['a']);
    expect(response.quota).toEqual(exhausted);
  });

  it('WX-10 a cache hit returns fresh recipe cards with the stored reasons', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);
    harness.recipeDto.cardsFor.mockImplementation(
      async (_userId: string, rows: RecipeEntity[]) =>
        rows.map((row) => card(row.id, `Renamed ${row.id}`)),
    );

    const response = await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
    expect(response.picks[0].recipe.title).toBe('Renamed a');
    expect(response.picks[0].reason).toBe('warming');
  });

  it('WX-10 a cache hit returns fresh weather context when the weather word is unchanged', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);
    harness.weather.weatherFor.mockResolvedValue({
      ...SNAPSHOT,
      temperatureC: 12.2,
    });

    const response = await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
    expect(response.weather?.temperatureC).toBe(12.2);
    expect(response.weather?.line).toBe('12 °C and clear tonight in Tel Aviv');
  });

  it('WX-10 a different weather word misses the cache', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);
    harness.weather.weatherFor.mockResolvedValue({
      ...SNAPSHOT,
      condition: 'rain',
      weatherCode: 61,
    });

    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
    expect(harness.quota.consume).toHaveBeenCalledTimes(2);
  });

  it('WX-10 a request without weather context is cached like any other', async () => {
    const harness = homeHarness();
    harness.weather.weatherFor.mockResolvedValue(null);

    await harness.service.recommend(USER, HOME);
    const second = await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
    expect(second.weather).toBeNull();
    expect(second.picks).toHaveLength(1);
  });

  it('WX-10 a changed candidate list misses the cache', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);
    harness.recipes.candidatesForRecommend.mockResolvedValue(
      entities('a', 'b', 'c'),
    );

    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 a new local hour misses the cache even within 60 minutes', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);

    jest.setSystemTime(new Date(T0.getTime() + 55 * MINUTE)); // 11:05 local
    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 the same local hour still hits after 49 minutes', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);

    jest.setSystemTime(new Date(T0.getTime() + 49 * MINUTE)); // 10:59 local
    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(1);
  });

  it('WX-10 "Show another" (excludeRecipeIds) always calls the model', async () => {
    const harness = homeHarness('{"picks":[{"id":"b","reason":"next"}]}');
    const another = { ...HOME, excludeRecipeIds: ['a'] };

    await harness.service.recommend(USER, another);
    await harness.service.recommend(USER, another);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
    expect(harness.quota.consume).toHaveBeenCalledTimes(2);
  });

  it('WX-10 "Show another" calls the model even when the plain request is cached, and its answer replaces the cached one', async () => {
    const harness = homeHarness();
    await harness.service.recommend(USER, HOME);

    // An excluded id outside the candidates leaves the sent list, and so the key, unchanged.
    harness.openRouter.chat.mockResolvedValueOnce(
      chatResult('{"picks":[{"id":"b","reason":"lighter"}]}'),
    );
    const another = await harness.service.recommend(USER, {
      ...HOME,
      excludeRecipeIds: ['not-a-candidate'],
    });
    const afterwards = await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
    expect(another.picks.map((pick) => pick.recipe.id)).toEqual(['b']);
    expect(
      afterwards.picks.map((pick) => [pick.recipe.id, pick.reason]),
    ).toEqual([['b', 'lighter']]);
  });

  it('WX-10 an answer with no usable pick is not cached', async () => {
    const harness = homeHarness('{"picks":[]}');

    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 a non-JSON answer is not cached', async () => {
    const harness = homeHarness('I would cook ramen tonight.');

    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 a failed model call is not cached', async () => {
    const harness = homeHarness();
    harness.openRouter.chat.mockRejectedValueOnce(
      new ServiceUnavailableException('The assistant is unavailable right now'),
    );

    await expect(harness.service.recommend(USER, HOME)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(USER, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 a timezone that Intl does not know is never cached', async () => {
    const harness = homeHarness();
    const unknown = { timezone: 'Mars/Olympus_Mons', scope: 'home' as const };

    await harness.service.recommend(USER, unknown);
    await harness.service.recommend(USER, unknown);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 keeps one cache per user', async () => {
    const harness = homeHarness();
    const other: AuthUser = {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'noa',
    };

    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(other, HOME);

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });

  it('WX-10 keeps one cache per scope', async () => {
    const harness = homeHarness();
    harness.recipeDto.listPublicCards.mockResolvedValue({
      cards: [card('a'), card('b')],
      hasMore: false,
    });

    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(USER, { ...HOME, scope: 'discover' });
    await harness.service.recommend(USER, HOME);
    await harness.service.recommend(USER, { ...HOME, scope: 'discover' });

    expect(harness.openRouter.chat).toHaveBeenCalledTimes(2);
  });
});

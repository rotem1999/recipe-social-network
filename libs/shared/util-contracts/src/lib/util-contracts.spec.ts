// util-contracts is types only (SPEC §11.6). These tests are compile-level: each literal is
// annotated with its DTO type, so `tsc` fails the build if a DTO drifts, and the runtime
// assertions keep the Vitest target meaningful.
import { describe, expect, it } from 'vitest';

import type {
  ApiErrorResponse,
  CookAskResponse,
  NutritionResponse,
  QuotaDto,
  RecipeCardDto,
  RecipeDetailDto,
  RecommendRequest,
  RecommendResponse,
} from './util-contracts';

const quota: QuotaDto = { used: 3, limit: 100, remaining: 97 };

const card: RecipeCardDto = {
  id: '6f1b2a7e-0b1e-4f2a-9f3c-0c0f1d2e3a4b',
  title: 'Shakshuka',
  category: 'Breakfast',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  visibility: 'public',
  relation: 'own',
  ownerUsername: 'rotem',
  source: 'user',
  imageUrl: 'https://example.invalid/signed/shakshuka.jpg',
  rating: { average: 4.33, count: 3, mine: 5 },
  versionNumber: 2,
  updatedAt: '2026-09-28T09:00:00.000Z',
};

describe('RecipeDetailDto', () => {
  const detail: RecipeDetailDto = {
    ...card,
    description: 'Eggs poached in a spiced tomato sauce.',
    ingredients: [
      { quantity: 4, unit: 'piece', name: 'egg' },
      { quantity: null, unit: 'none', name: 'salt', note: 'to taste' },
    ],
    steps: [
      { text: 'Fry the onion and pepper.', durationMinutes: 5 },
      { text: 'Add the tomatoes and simmer.' },
    ],
    imageUrls: ['https://example.invalid/signed/shakshuka.jpg'],
    canCook: true,
    canEdit: true,
    canRate: false,
    hasComments: true,
    hasVotes: true,
    versionCount: 2,
    forkedFrom: null,
    savedFrom: { recipeId: null, title: 'Shakshuka', ownerUsername: null },
    sharedWithUserIds: [],
    attribution: 'Recipe data from TheMealDB',
  };

  it('§11.6 carries every card field a recipe detail response extends', () => {
    expect(detail).toMatchObject({
      id: card.id,
      title: 'Shakshuka',
      category: 'Breakfast',
      servings: 2,
      visibility: 'public',
      relation: 'own',
      ownerUsername: 'rotem',
      source: 'user',
      versionNumber: 2,
    });
  });

  it('§3.1.1 carries structured ingredients, with an empty quantity for "to taste"', () => {
    expect(detail.ingredients).toMatchObject([
      { quantity: 4, unit: 'piece', name: 'egg' },
      { quantity: null, unit: 'none', name: 'salt', note: 'to taste' },
    ]);
  });

  it('§3.1.1 carries ordered steps, with an optional durationMinutes timer', () => {
    expect(detail.steps).toMatchObject([
      { text: 'Fry the onion and pepper.', durationMinutes: 5 },
      { text: 'Add the tomatoes and simmer.' },
    ]);
    expect(detail.steps[1].durationMinutes).toBeUndefined();
  });

  it('IMG-4 carries signed image URLs, not bucket object paths', () => {
    expect(detail.imageUrls).toEqual(['https://example.invalid/signed/shakshuka.jpg']);
    expect(detail.imageUrls.every((url) => url.startsWith('https://'))).toBe(true);
  });

  it('REC-7 and SAVE-4..6 carry the version count and the fork/save attribution slots', () => {
    expect(detail).toMatchObject({
      versionCount: 2,
      forkedFrom: null,
      savedFrom: { recipeId: null, title: 'Shakshuka', ownerUsername: null },
    });
  });

  it('RATE-2 carries the two-decimal average with the caller’s own stars', () => {
    expect(detail.rating).toMatchObject({ average: 4.33, count: 3, mine: 5 });
  });
});

describe('RecommendResponse', () => {
  const request: RecommendRequest = {
    timezone: 'Asia/Jerusalem',
    scope: 'home',
    excludeRecipeIds: [card.id],
  };

  const response: RecommendResponse = {
    picks: [{ recipe: card, reason: 'Warm and quick for a cool evening.' }],
    weather: {
      city: 'Tel Aviv',
      temperatureC: 18.4,
      isDay: false,
      condition: 'Clear sky',
      localHour: 19,
      line: 'Clear sky, 18°C in Tel Aviv',
    },
    quota,
  };

  it('§8 request carries the IANA timezone, the scope and the ids already shown', () => {
    expect(request).toMatchObject({
      timezone: 'Asia/Jerusalem',
      scope: 'home',
      excludeRecipeIds: [card.id],
    });
  });

  it('§8 response carries the picks with a reason each', () => {
    expect(response.picks).toMatchObject([
      { recipe: { id: card.id, title: 'Shakshuka' }, reason: 'Warm and quick for a cool evening.' },
    ]);
  });

  it('§8 response carries the weather context used for the pick', () => {
    expect(response.weather).toMatchObject({
      city: 'Tel Aviv',
      temperatureC: 18.4,
      isDay: false,
      condition: 'Clear sky',
      localHour: 19,
    });
  });

  it('§8 weather is null when no weather context is available', () => {
    const withoutWeather: RecommendResponse = { picks: [], weather: null, quota };
    expect(withoutWeather.weather).toBeNull();
    expect(withoutWeather.picks).toEqual([]);
  });

  it('COOK-8 response carries the AI quota as used, limit and remaining', () => {
    expect(response.quota).toMatchObject({ used: 3, limit: 100, remaining: 97 });
    expect(response.quota.used + response.quota.remaining).toBe(response.quota.limit);
  });
});

describe('NutritionResponse', () => {
  const perIngredient: NutritionResponse = {
    mode: 'ingredients',
    servings: 2,
    kcalPerPortion: 214.5,
    kcalTotal: 429,
    partial: true,
    ingredients: [
      { name: 'egg', grams: 200, kcal: 286, matchedDescription: 'Egg, whole, raw, fresh' },
      { name: 'salt', grams: null, kcal: null, matchedDescription: null },
    ],
    matchedDescription: null,
    source: 'USDA FoodData Central',
  };

  it('§9 ingredients mode carries a per-ingredient breakdown and the portion totals', () => {
    expect(perIngredient).toMatchObject({
      mode: 'ingredients',
      servings: 2,
      kcalPerPortion: 214.5,
      kcalTotal: 429,
      ingredients: [
        { name: 'egg', grams: 200, kcal: 286, matchedDescription: 'Egg, whole, raw, fresh' },
        { name: 'salt', grams: null, kcal: null, matchedDescription: null },
      ],
    });
  });

  it('§9 marks the result partial when an ingredient had no USDA match', () => {
    expect(perIngredient.partial).toBe(true);
    expect(perIngredient.ingredients.some((ingredient) => ingredient.kcal === null)).toBe(true);
  });

  it('§9 meal mode carries one matched description and no ingredient rows', () => {
    const wholeMeal: NutritionResponse = {
      mode: 'meal',
      servings: 4,
      kcalPerPortion: 320,
      kcalTotal: 1280,
      partial: false,
      ingredients: [],
      matchedDescription: 'Shakshuka, prepared',
      source: 'USDA FoodData Central',
    };
    expect(wholeMeal).toMatchObject({
      mode: 'meal',
      servings: 4,
      partial: false,
      ingredients: [],
      matchedDescription: 'Shakshuka, prepared',
    });
  });

  it('§9 always attributes the data to USDA FoodData Central', () => {
    expect(perIngredient.source).toBe('USDA FoodData Central');
  });
});

describe('CookAskResponse', () => {
  it('§10 carries the answer with the model, token counts and cost that are logged', () => {
    const response: CookAskResponse = {
      answer: 'Keep the heat low so the eggs set slowly.',
      quota,
      model: 'minimax/minimax-m3',
      promptTokens: 412,
      completionTokens: 88,
      cost: 0.00031,
    };
    expect(response).toMatchObject({
      model: 'minimax/minimax-m3',
      promptTokens: 412,
      completionTokens: 88,
      cost: 0.00031,
      quota: { used: 3, limit: 100, remaining: 97 },
    });
  });
});

describe('ApiErrorResponse', () => {
  it('§11.6 carries a single message or a list of validation messages', () => {
    const single: ApiErrorResponse = { statusCode: 429, message: 'AI quota exhausted', error: 'Too Many Requests' };
    const many: ApiErrorResponse = { statusCode: 400, message: ['title is required', 'at least one step is required'] };
    expect(single).toMatchObject({ statusCode: 429, message: 'AI quota exhausted' });
    expect(many).toMatchObject({ statusCode: 400, message: ['title is required', 'at least one step is required'] });
  });
});

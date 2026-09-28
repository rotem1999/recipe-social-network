// SPEC §9 NUT-1..NUT-6. The USDA client is a hand-written fake at its module
// boundary: no network, no key, no database.
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecipeEntity, RecipeVersionEntity } from '@rsn/api/data-access-db';
import type {
  UsdaFoodDetail,
  UsdaFoodHit,
  UsdaService,
} from '@rsn/api/data-access-usda';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { Ingredient } from '@rsn/shared/util-domain';

import { NutritionService } from './nutrition.service';

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
const RECIPE_ID = '11111111-1111-4111-8111-111111111111';

/** Field names as SPEC §9 lists them for FoodData Central search results. */
function hit(overrides: Partial<UsdaFoodHit> = {}): UsdaFoodHit {
  return {
    fdcId: 169761,
    description: 'Noodles, egg, dry, enriched',
    dataType: 'SR Legacy',
    kcalPer100g: 384,
    gramWeightPerMeasure: null,
    ...overrides,
  };
}

function version(
  ingredients: Ingredient[],
  servings = 4,
  title = 'Lasagna with meat',
): RecipeVersionEntity {
  return {
    title,
    servings,
    ingredients,
    steps: [{ text: 'Cook' }],
  } as RecipeVersionEntity;
}

interface Harness {
  service: NutritionService;
  access: { loadOrThrow: jest.Mock; assertCanView: jest.Mock };
  usda: { searchFoods: jest.Mock; getFood: jest.Mock };
}

function makeHarness(currentVersion: RecipeVersionEntity | null): Harness {
  const recipe = {
    id: RECIPE_ID,
    ownerId: USER.id,
    visibility: 'private',
    deletedAt: null,
    currentVersion,
  } as RecipeEntity;

  const access = {
    loadOrThrow: jest.fn().mockResolvedValue(recipe),
    assertCanView: jest.fn().mockResolvedValue(undefined),
  };
  const usda = {
    searchFoods: jest.fn().mockResolvedValue([]),
    getFood: jest.fn().mockResolvedValue(null),
  };

  return {
    service: new NutritionService(
      access as unknown as RecipeAccessService,
      usda as unknown as UsdaService,
    ),
    access,
    usda,
  };
}

describe('NutritionService.compute access and mode (NUT-1, NUT-3, NUT-4)', () => {
  it('NUT-1 refuses a recipe the caller may not view', async () => {
    const harness = makeHarness(version([]));
    harness.access.assertCanView.mockRejectedValue(
      new ForbiddenException('You cannot view this recipe'),
    );

    await expect(
      harness.service.compute(USER, RECIPE_ID, 'ingredients'),
    ).rejects.toThrow(ForbiddenException);
    expect(harness.usda.searchFoods).not.toHaveBeenCalled();
  });

  it('NUT-1 reports 404 when the recipe has no current version', async () => {
    const harness = makeHarness(null);

    await expect(
      harness.service.compute(USER, RECIPE_ID, 'ingredients'),
    ).rejects.toThrow(NotFoundException);
  });

  it('NUT-2 names USDA FoodData Central as the source', async () => {
    const harness = makeHarness(version([]));

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.source).toBe('USDA FoodData Central');
  });
});

describe('NutritionService.compute ingredients mode (NUT-4, NUT-5, NUT-6)', () => {
  it('NUT-6 searches SR Legacy, Foundation and Survey (FNDDS) per ingredient', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }]),
    );
    harness.usda.searchFoods.mockResolvedValue([hit()]);

    await harness.service.compute(USER, RECIPE_ID, 'ingredients');

    expect(harness.usda.searchFoods).toHaveBeenCalledWith('egg noodles', [
      'SR Legacy',
      'Foundation',
      'Survey (FNDDS)',
    ]);
  });

  it('NUT-6 computes kcal as kcal/100 g times grams divided by 100', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 4),
    );
    harness.usda.searchFoods.mockResolvedValue([hit({ kcalPer100g: 384 })]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 384 kcal/100 g × 200 g / 100 = 768
    expect(response.ingredients).toEqual([
      {
        name: 'egg noodles',
        grams: 200,
        kcal: 768,
        matchedDescription: 'Noodles, egg, dry, enriched',
      },
    ]);
    expect(response.kcalTotal).toBe(768);
    expect(response.partial).toBe(false);
    expect(response.mode).toBe('ingredients');
    expect(response.matchedDescription).toBeNull();
  });

  it('NUT-6 divides the total by the servings for the per-portion value', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 100, unit: 'g', name: 'pork belly' },
        ],
        4,
      ),
    );
    harness.usda.searchFoods
      .mockResolvedValueOnce([hit({ kcalPer100g: 384 })])
      .mockResolvedValueOnce([
        hit({ kcalPer100g: 518, description: 'Pork, fresh, belly, raw' }),
      ]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    // 768 + 518 = 1286 total; 1286 / 4 servings = 321.5 → 322
    expect(response.kcalTotal).toBe(1286);
    expect(response.servings).toBe(4);
    expect(response.kcalPerPortion).toBe(322);
  });

  it('NUT-5 marks the answer partial when one ingredient has no USDA match', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 1, unit: 'tbsp', name: 'grandmother secret mix' },
        ],
        2,
      ),
    );
    harness.usda.searchFoods
      .mockResolvedValueOnce([hit({ kcalPer100g: 384 })])
      .mockResolvedValueOnce([]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.partial).toBe(true);
    expect(response.ingredients[1]).toEqual({
      name: 'grandmother secret mix',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    // The total keeps summing what did match.
    expect(response.kcalTotal).toBe(768);
  });

  it('NUT-5 leaves a "to taste" quantity unmatched without asking USDA', async () => {
    const harness = makeHarness(
      version([{ quantity: null, unit: 'ml', name: 'chili oil' }], 2),
    );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.searchFoods).not.toHaveBeenCalled();
    expect(response.partial).toBe(true);
    expect(response.kcalTotal).toBeNull();
    expect(response.kcalPerPortion).toBeNull();
  });

  it('NUT-6 reads the first foodPortions gramWeight for a `piece` quantity', async () => {
    const harness = makeHarness(
      version([{ quantity: 2, unit: 'piece', name: 'egg' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([
      hit({ fdcId: 748967, description: 'Egg, whole, raw', kcalPer100g: 143 }),
    ]);
    harness.usda.getFood.mockResolvedValue({
      fdcId: 748967,
      description: 'Egg, whole, raw',
      kcalPer100g: 143,
      portions: [{ gramWeight: 50, description: '1 large' }],
    } as UsdaFoodDetail);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(harness.usda.getFood).toHaveBeenCalledWith(748967);
    // 2 pieces × 50 g = 100 g → 143 kcal
    expect(response.ingredients[0].grams).toBe(100);
    expect(response.ingredients[0].kcal).toBe(143);
  });

  it('NUT-5 leaves an ingredient unavailable when USDA is down for it (503)', async () => {
    const harness = makeHarness(
      version(
        [
          { quantity: 200, unit: 'g', name: 'egg noodles' },
          { quantity: 100, unit: 'g', name: 'pork belly' },
        ],
        2,
      ),
    );
    harness.usda.searchFoods
      .mockResolvedValueOnce([hit({ kcalPer100g: 384 })])
      .mockRejectedValueOnce(
        new ServiceUnavailableException('FoodData Central is unreachable'),
      );

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0].kcal).toBe(768);
    expect(response.ingredients[1]).toEqual({
      name: 'pork belly',
      grams: null,
      kcal: null,
      matchedDescription: null,
    });
    expect(response.partial).toBe(true);
  });

  it('NUT-6 lets a USDA 429 fail the whole request (U1: 1,000 requests/hour)', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 2),
    );
    harness.usda.searchFoods.mockRejectedValue(
      new HttpException('USDA rate limit reached', HttpStatus.TOO_MANY_REQUESTS),
    );

    const error = await harness.service
      .compute(USER, RECIPE_ID, 'ingredients')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('NUT-5 reports an ingredient whose match carries no energy value as unavailable', async () => {
    const harness = makeHarness(
      version([{ quantity: 200, unit: 'g', name: 'egg noodles' }], 2),
    );
    harness.usda.searchFoods.mockResolvedValue([hit({ kcalPer100g: null })]);

    const response = await harness.service.compute(
      USER,
      RECIPE_ID,
      'ingredients',
    );

    expect(response.ingredients[0].kcal).toBeNull();
    expect(response.partial).toBe(true);
  });
});

describe('NutritionService.compute meal mode (NUT-3, NUT-6)', () => {
  it('NUT-6 searches the recipe title in Survey (FNDDS) only', async () => {
    const harness = makeHarness(version([], 4, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([]);

    await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(harness.usda.searchFoods).toHaveBeenCalledWith('Lasagna with meat', [
      'Survey (FNDDS)',
    ]);
  });

  it('NUT-6 returns the matched description and kcal per portion of the first hit', async () => {
    const harness = makeHarness(version([], 4, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: 250,
      }),
    ]);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.mode).toBe('meal');
    expect(response.matchedDescription).toBe('Lasagna with meat');
    // 139 kcal/100 g × 250 g / 100 = 347.5 → 348 per portion
    expect(response.kcalPerPortion).toBe(348);
    expect(response.kcalTotal).toBe(1392);
    expect(response.partial).toBe(false);
    expect(harness.usda.getFood).not.toHaveBeenCalled();
  });

  it('NUT-6 falls back to the first foodPortions gramWeight when the hit has no measure', async () => {
    const harness = makeHarness(version([], 2, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: null,
      }),
    ]);
    harness.usda.getFood.mockResolvedValue({
      fdcId: 2341573,
      description: 'Lasagna with meat',
      kcalPer100g: 139,
      portions: [{ gramWeight: 200, description: '1 cup' }],
    } as UsdaFoodDetail);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(harness.usda.getFood).toHaveBeenCalledWith(2341573);
    expect(response.kcalPerPortion).toBe(278);
  });

  it('NUT-6 shows only the kcal/100 g basis when no portion weight exists', async () => {
    const harness = makeHarness(version([], 2, 'Lasagna with meat'));
    harness.usda.searchFoods.mockResolvedValue([
      hit({
        fdcId: 2341573,
        description: 'Lasagna with meat',
        dataType: 'Survey (FNDDS)',
        kcalPer100g: 139,
        gramWeightPerMeasure: null,
      }),
    ]);
    harness.usda.getFood.mockResolvedValue(null);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response.kcalPerPortion).toBeNull();
    expect(response.kcalTotal).toBeNull();
    expect(response.partial).toBe(true);
    expect(response.ingredients).toEqual([
      {
        name: 'Lasagna with meat',
        grams: 100,
        kcal: 139,
        matchedDescription: 'Lasagna with meat',
      },
    ]);
  });

  it('NUT-5 returns everything null when the title matches no FNDDS dish', async () => {
    const harness = makeHarness(version([], 3, 'Grandmother surprise'));
    harness.usda.searchFoods.mockResolvedValue([]);

    const response = await harness.service.compute(USER, RECIPE_ID, 'meal');

    expect(response).toEqual({
      mode: 'meal',
      servings: 3,
      kcalPerPortion: null,
      kcalTotal: null,
      partial: true,
      ingredients: [],
      matchedDescription: null,
      source: 'USDA FoodData Central',
    });
  });
});

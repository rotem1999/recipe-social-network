// SPEC §6 RATE-1..RATE-4. Hand-written fakes only: no database, no network.
import { ForbiddenException } from '@nestjs/common';
import { RatingEntity, RecipeEntity } from '@rsn/api/data-access-db';
import type { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { Visibility } from '@rsn/shared/util-domain';

import { RatingsService } from './ratings.service';

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


const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function recipeRow(visibility: Visibility): RecipeEntity {
  return {
    id: RECIPE_ID,
    ownerId: 'owner-id',
    visibility,
    ratingAverage: null,
    ratingCount: 0,
    deletedAt: null,
  } as RecipeEntity;
}

/** The chained query builder `aggregate` uses (RATE-2). */
interface AggregateBuilderFake {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  getRawOne: jest.Mock;
}

interface Harness {
  service: RatingsService;
  access: { loadOrThrow: jest.Mock; assertCanView: jest.Mock };
  /** The `ratings` repository handed out inside the transaction. */
  txRatings: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  recipeUpdate: jest.Mock;
  outerRatings: { findOne: jest.Mock };
  /** Raw aggregate row the query builder returns. */
  setAggregate: (row: { count: string; average: string | null } | null) => void;
  queryBuilderCalls: unknown[][];
}

function makeHarness(recipe: RecipeEntity): Harness {
  let aggregate: { count: string; average: string | null } | null = {
    count: '1',
    average: '4',
  };
  const queryBuilderCalls: unknown[][] = [];

  const txRatings = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => ({ ...(entity as object) })),
  };
  const recipeUpdate = jest.fn().mockResolvedValue(undefined);

  const manager = {
    getRepository: jest.fn((target: unknown) =>
      target === RatingEntity ? txRatings : { update: recipeUpdate },
    ),
    createQueryBuilder: jest.fn((...args: unknown[]) => {
      queryBuilderCalls.push(args);
      const builder: AggregateBuilderFake = {
        select: jest.fn(() => builder),
        addSelect: jest.fn(() => builder),
        where: jest.fn(() => builder),
        getRawOne: jest.fn(async () => aggregate),
      };
      return builder;
    }),
  };

  const outerRatings = { findOne: jest.fn().mockResolvedValue(null) };
  const ratingsRepository = {
    ...outerRatings,
    manager: {
      transaction: jest.fn(
        async (cb: (m: unknown) => Promise<unknown>): Promise<unknown> =>
          cb(manager),
      ),
    },
  };

  const access = {
    loadOrThrow: jest.fn().mockResolvedValue(recipe),
    assertCanView: jest.fn().mockResolvedValue(undefined),
  };

  const service = new RatingsService(
    ratingsRepository as never,
    access as unknown as RecipeAccessService,
  );

  return {
    service,
    access,
    txRatings,
    recipeUpdate,
    outerRatings,
    setAggregate: (row) => {
      aggregate = row;
    },
    queryBuilderCalls,
  };
}

describe('RatingsService (RATE-1, RATE-2, RATE-4)', () => {
  it('RATE-1 refuses a grade on a private recipe with 403', async () => {
    const harness = makeHarness(recipeRow('private'));

    await expect(harness.service.rate(USER_ID, RECIPE_ID, 4)).rejects.toThrow(
      ForbiddenException,
    );
    expect(harness.txRatings.save).not.toHaveBeenCalled();
  });

  it('RATE-1 refuses a grade on a shared recipe with 403', async () => {
    const harness = makeHarness(recipeRow('shared'));

    await expect(harness.service.rate(USER_ID, RECIPE_ID, 4)).rejects.toThrow(
      'Only public recipes can be rated',
    );
    expect(harness.txRatings.save).not.toHaveBeenCalled();
  });

  it('RATE-1 checks that the caller may view the recipe before rating it', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.access.assertCanView.mockRejectedValue(
      new ForbiddenException('You cannot view this recipe'),
    );

    await expect(harness.service.rate(USER_ID, RECIPE_ID, 4)).rejects.toThrow(
      'You cannot view this recipe',
    );
    expect(harness.txRatings.save).not.toHaveBeenCalled();
  });

  it('RATE-4 inserts one row when the caller has not rated the recipe yet', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.setAggregate({ count: '1', average: '5' });

    const summary = await harness.service.rate(USER_ID, RECIPE_ID, 5);

    expect(harness.txRatings.create).toHaveBeenCalledWith({
      recipeId: RECIPE_ID,
      userId: USER_ID,
      stars: 5,
    });
    expect(harness.txRatings.save).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ average: 5, count: 1, mine: 5 });
  });

  it('RATE-4 replaces the earlier value instead of adding a second row', async () => {
    const harness = makeHarness(recipeRow('public'));
    const existing = { id: 'rating-1', recipeId: RECIPE_ID, userId: USER_ID, stars: 2 };
    harness.txRatings.findOne.mockResolvedValue(existing);
    harness.setAggregate({ count: '1', average: '5' });

    await harness.service.rate(USER_ID, RECIPE_ID, 5);

    expect(harness.txRatings.create).not.toHaveBeenCalled();
    expect(harness.txRatings.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rating-1', stars: 5 }),
    );
  });

  it('RATE-4 looks the earlier grade up by recipe and user (one rating per pair)', async () => {
    const harness = makeHarness(recipeRow('public'));

    await harness.service.rate(USER_ID, RECIPE_ID, 3);

    expect(harness.txRatings.findOne).toHaveBeenCalledWith({
      where: { recipeId: RECIPE_ID, userId: USER_ID },
    });
  });

  it('RATE-2 recomputes the average to two decimals and stores it with the count', async () => {
    const harness = makeHarness(recipeRow('public'));
    // 5 + 4 + 4 = 13 / 3 = 4.333… → 4.33
    harness.setAggregate({ count: '3', average: '4.3333333333333333' });

    const summary = await harness.service.rate(USER_ID, RECIPE_ID, 5);

    expect(summary).toEqual({ average: 4.33, count: 3, mine: 5 });
    expect(harness.recipeUpdate).toHaveBeenCalledWith(
      { id: RECIPE_ID },
      { ratingAverage: 4.33, ratingCount: 3 },
    );
  });

  it('RATE-2 rounds the stored average half up, still to two decimals', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.setAggregate({ count: '2', average: '3.455' });

    const summary = await harness.service.rate(USER_ID, RECIPE_ID, 4);

    expect(summary.average).toBe(3.46);
    expect(harness.recipeUpdate).toHaveBeenCalledWith(
      { id: RECIPE_ID },
      { ratingAverage: 3.46, ratingCount: 2 },
    );
  });

  it('RATE-2 aggregates over the ratings of this recipe only', async () => {
    const harness = makeHarness(recipeRow('public'));

    await harness.service.rate(USER_ID, RECIPE_ID, 4);

    expect(harness.queryBuilderCalls[0]).toEqual([RatingEntity, 'rating']);
  });

  it('RATE-2 stores a null average when the aggregate reports no rows', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.setAggregate({ count: '0', average: null });

    const summary = await harness.service.rate(USER_ID, RECIPE_ID, 4);

    expect(summary).toEqual({ average: null, count: 0, mine: 4 });
    expect(harness.recipeUpdate).toHaveBeenCalledWith(
      { id: RECIPE_ID },
      { ratingAverage: null, ratingCount: 0 },
    );
  });

  it('RATE-2 writes the rating and the recomputed average in one transaction', async () => {
    const harness = makeHarness(recipeRow('public'));

    await harness.service.rate(USER_ID, RECIPE_ID, 4);

    expect(harness.txRatings.save).toHaveBeenCalled();
    expect(harness.recipeUpdate).toHaveBeenCalled();
  });
});

describe('RatingsService.summary (RATE-2, RATE-3)', () => {
  it('RATE-2 returns the stored average and count with the caller grade', async () => {
    const recipe = recipeRow('public');
    recipe.ratingAverage = 4.25;
    recipe.ratingCount = 8;
    const harness = makeHarness(recipe);
    harness.outerRatings.findOne.mockResolvedValue({ stars: 3 });

    await expect(harness.service.summary(USER_ID, RECIPE_ID)).resolves.toEqual({
      average: 4.25,
      count: 8,
      mine: 3,
    });
  });

  it('RATE-4 reports a null own grade when the caller has not rated', async () => {
    const recipe = recipeRow('public');
    recipe.ratingAverage = 4.25;
    recipe.ratingCount = 8;
    const harness = makeHarness(recipe);
    harness.outerRatings.findOne.mockResolvedValue(null);

    await expect(harness.service.summary(USER_ID, RECIPE_ID)).resolves.toEqual({
      average: 4.25,
      count: 8,
      mine: null,
    });
  });
});

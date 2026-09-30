// §3: REC-1/6/7/8, SAVE-1/4..10, CAT-3/4/7, IMG-3/6/7 and §3.1.1 validation on every recipe write.
import {
  BadRequestException,
  ForbiddenException,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
} from '@rsn/api/data-access-db';
import type { ImageStorageService } from '@rsn/api/data-access-images';
import type { MealRecord, TheMealDbService } from '@rsn/api/data-access-themealdb';
import type { FriendsService } from '@rsn/api/feature-friends';
import {
  MAX_IMAGES_PER_RECIPE,
  MAX_INGREDIENTS,
  MAX_STEPS,
} from '@rsn/shared/util-domain';
import type {
  Category,
  RecipeContent,
  RecipeSource,
  Visibility,
} from '@rsn/shared/util-domain';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { RecipeWriteDto } from './dto/recipe-write.dto';
import { RecipeAccessService } from './recipe-access.service';
import type { RecipeDtoService } from './recipe-dto.service';
import { RecipesService } from './recipes.service';

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
/**
 * The real CAT-6 mapper, wrapped so one test can hand `saveCatalogue` a mapped meal
 * with more ingredients than TheMealDB's 20 slots allow (§3.1.1 upper limits).
 */
jest.mock('@rsn/api/data-access-themealdb', () => {
  const actual = jest.requireActual('@rsn/api/data-access-themealdb');
  return {
    ...actual,
    toRecipeContent: jest.fn(actual.toRecipeContent),
  };
});
const mapperMocks = jest.requireMock('@rsn/api/data-access-themealdb') as {
  toRecipeContent: jest.Mock;
};


const ME = 'user-me';
const OWNER = 'user-owner';
const AT = new Date('2026-09-28T10:00:00.000Z');

/** §3.1.1: the smallest content that passes `validateRecipeContent`. */
function content(overrides: Partial<RecipeContent> = {}): RecipeContent {
  return {
    title: 'Shakshuka',
    category: 'Breakfast' as Category,
    servings: 2,
    ingredients: [{ quantity: 4, unit: 'piece', name: 'egg' }],
    steps: [{ text: 'Crack the eggs into the sauce.' }],
    ...overrides,
  };
}

function recipeRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
  return {
    id: 'recipe-1',
    ownerId: OWNER,
    visibility: 'private' as Visibility,
    currentVersionId: 'version-1',
    savedFromRecipeId: null,
    forkedFromRecipeId: null,
    forkedAt: null,
    syncedVersionNumber: null,
    source: 'user' as RecipeSource,
    externalId: null,
    externalTitle: null,
    externalImageUrl: null,
    ratingAverage: null,
    ratingCount: 0,
    deletedAt: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as RecipeEntity;
}

function versionRow(
  overrides: Partial<RecipeVersionEntity> = {},
): RecipeVersionEntity {
  return {
    id: 'version-1',
    recipeId: 'recipe-1',
    versionNumber: 1,
    title: 'Shakshuka',
    description: null,
    category: 'Breakfast' as Category,
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: [{ quantity: 4, unit: 'piece', name: 'egg' }],
    steps: [{ text: 'Crack the eggs into the sauce.' }],
    imagePaths: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as RecipeVersionEntity;
}

const DETAIL = { id: 'recipe-1', title: 'Shakshuka' } as RecipeDetailDto;

interface Harness {
  service: RecipesService;
  recipes: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  versions: { find: jest.Mock; findOne: jest.Mock; update: jest.Mock };
  shares: { find: jest.Mock; exists: jest.Mock; delete: jest.Mock };
  manager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  dataSource: { transaction: jest.Mock; query: jest.Mock };
  dtos: { toDetail: jest.Mock; cardsFor: jest.Mock };
  images: { upload: jest.Mock; signedUrls: jest.Mock; remove: jest.Mock };
  friends: { friendIdsOf: jest.Mock; areFriends: jest.Mock };
  theMealDb: { lookup: jest.Mock };
}

function harness(): Harness {
  const recipes = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const versions = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const shares = {
    find: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  let generated = 0;
  const manager = {
    create: jest.fn(
      (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    ),
    save: jest.fn((entity: unknown) =>
      Promise.resolve(
        Array.isArray(entity)
          ? entity
          : { id: `generated-${++generated}`, ...(entity as object) },
      ),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const dataSource = {
    transaction: jest.fn((callback: (m: EntityManager) => Promise<unknown>) =>
      callback(manager as unknown as EntityManager),
    ),
    query: jest.fn().mockResolvedValue([]),
  };

  const dtos = {
    toDetail: jest.fn().mockResolvedValue(DETAIL),
    cardsFor: jest.fn().mockResolvedValue([]),
  };
  const images = {
    upload: jest.fn().mockResolvedValue('recipes/recipe-1/new.jpg'),
    signedUrls: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const friends = {
    friendIdsOf: jest.fn().mockResolvedValue([]),
    areFriends: jest.fn().mockResolvedValue(false),
  };
  const theMealDb = { lookup: jest.fn().mockResolvedValue(null) };

  // The real access service, so ownership and visibility are not faked away.
  const access = new RecipeAccessService(
    recipes as unknown as Repository<RecipeEntity>,
    shares as unknown as Repository<RecipeShareEntity>,
  );

  const service = new RecipesService(
    recipes as unknown as Repository<RecipeEntity>,
    versions as unknown as Repository<RecipeVersionEntity>,
    shares as unknown as Repository<RecipeShareEntity>,
    dataSource as unknown as DataSource,
    access,
    dtos as unknown as RecipeDtoService,
    images as unknown as ImageStorageService,
    friends as unknown as FriendsService,
    theMealDb as unknown as TheMealDbService,
  );
  return {
    service,
    recipes,
    versions,
    shares,
    manager,
    dataSource,
    dtos,
    images,
    friends,
    theMealDb,
  };
}

/** Narrows the rejection of a call that must fail, so its body can be asserted. */
async function failureOf<T extends { message: string }>(
  promise: Promise<unknown>,
): Promise<T> {
  try {
    await promise;
  } catch (error) {
    return error as T;
  }
  throw new Error('the call was expected to reject');
}

/*
 * IMG-7 release rule (2026-09-30): only paths in the IMG-6 shape
 * `recipes/<recipeId>/<uuid>.<ext>` name an owning recipe, so these fixtures use real
 * UUIDs. None of them is a real object.
 */
const RELEASE_OWN_ID = '3b0f6f7e-2c1d-4e5a-9b8c-7d6e5f4a3b2c';
const RELEASE_SOURCE_ID = '9a8b7c6d-5e4f-4321-8fed-cba987654321';
const RELEASE_COPY_ID = '5c1e7a2b-3d4f-4a6b-8c9d-0e1f2a3b4c5d';
const RELEASE_GRAND_ID = '1b2c3d4e-5f60-4718-89ab-cdef01234567';
const RELEASE_OWN_IMG = `recipes/${RELEASE_OWN_ID}/0c9b8a7f-6e5d-4c4b-8a39-281706f5e4d3.png`;
const RELEASE_SOURCE_IMG = `recipes/${RELEASE_SOURCE_ID}/3f2e1d0c-9b8a-4765-8432-10fedcba9876.png`;
const RELEASE_COPY_IMG = `recipes/${RELEASE_COPY_ID}/7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918.png`;
const RELEASE_GRAND_IMG = `recipes/${RELEASE_GRAND_ID}/2d3c4b5a-6978-4867-a5b4-c3d2e1f0a9b8.png`;

/** The IMG-7 owner lookup answer: the owning recipe's id and `deleted_at`, or null when gone. */
type OwnerRow = { id: string; deletedAt: Date | null } | null;

/**
 * Routes `recipes.findOne` by the shape of its options: the IMG-7 owner lookup selects
 * `{ id, deletedAt }`; the SAVE-10 source lookup filters on `deletedAt`; anything else is
 * `loadOrThrow`. An owner missing from `owners` is gone (null).
 */
function routeFindOne(
  h: Harness,
  route: {
    load: RecipeEntity;
    source?: RecipeEntity | null;
    owners?: Record<string, OwnerRow>;
    ownerError?: unknown;
  },
): void {
  h.recipes.findOne.mockImplementation(
    async (options: {
      where: { id: string; deletedAt?: unknown };
      select?: Record<string, boolean>;
    }) => {
      if (options.select !== undefined) {
        if (route.ownerError !== undefined) throw route.ownerError;
        return route.owners?.[options.where.id] ?? null;
      }
      if ('deletedAt' in options.where) return route.source ?? null;
      return route.load;
    },
  );
}

/**
 * Answers the IMG-7 "is it shown by a live current version" query from `shown` (false when
 * a path is missing), or throws `shown` when it is an Error; every other query is a sweep.
 */
function routeQueries(h: Harness, shown: Record<string, boolean> | Error = {}): void {
  h.dataSource.query.mockImplementation(async (sql: string, parameters: unknown[]) => {
    if (sql.includes('SELECT EXISTS')) {
      if (shown instanceof Error) throw shown;
      return [{ shown: shown[parameters[0] as string] ?? false }];
    }
    return [];
  });
}

/** The paths the IMG-7 "shown" query was asked about, in order. */
function existsChecks(h: Harness): string[] {
  return (h.dataSource.query.mock.calls as [string, unknown[]][])
    .filter(([sql]) => sql.includes('SELECT EXISTS'))
    .map(([, parameters]) => parameters[0] as string);
}

/** The paths swept out of every version (`array_remove`), in order. */
function sweptPaths(h: Harness): string[] {
  return (h.dataSource.query.mock.calls as [string, unknown[]][])
    .filter(([sql]) => sql.includes('array_remove'))
    .map(([, parameters]) => parameters[0] as string);
}

/** The recipe ids the IMG-7 owner lookup was asked about, in order. */
function ownerLookups(h: Harness): string[] {
  return (
    h.recipes.findOne.mock.calls as [
      { where: { id: string }; select?: Record<string, boolean> },
    ][]
  )
    .filter(([options]) => options.select !== undefined)
    .map(([options]) => options.where.id);
}

describe('RecipesService', () => {
  describe('REC-1, REC-7 create', () => {
    it('REC-1 stores a private recipe owned by the caller with no saved or forked origin', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await service.create(ME, content());

      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          ownerId: ME,
          visibility: 'private',
          source: 'user',
          currentVersionId: null,
          savedFromRecipeId: null,
          forkedFromRecipeId: null,
          ratingAverage: null,
          ratingCount: 0,
          deletedAt: null,
        }),
      );
    });

    it('SAVE-7 stores a new recipe as no copy: forked_at, synced_version_number and external_title null', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await service.create(ME, content());

      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          forkedAt: null,
          syncedVersionNumber: null,
          externalId: null,
          externalTitle: null,
        }),
      );
    });

    it('REC-7 writes version 1 and points the recipe at it', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await service.create(ME, content({ description: 'Eggs in sauce' }));

      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        RecipeVersionEntity,
        expect.objectContaining({
          recipeId: 'generated-1',
          versionNumber: 1,
          imagePaths: [],
          title: 'Shakshuka',
          description: 'Eggs in sauce',
          category: 'Breakfast',
          servings: 2,
          prepMinutes: null,
          cookMinutes: null,
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'generated-1' },
        { currentVersionId: 'generated-2' },
      );
    });

    it('§3.1.1 BUG-033 creates a recipe from a body with description: null (through the ValidationPipe) and stores it as null', async () => {
      const { service, recipes, manager, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const dto = (await pipe.transform(
        {
          ...content(),
          description: null,
          prepMinutes: null,
          cookMinutes: null,
          ingredients: [{ quantity: 4, unit: 'piece', name: 'egg', note: null }],
          steps: [{ text: 'Crack the eggs into the sauce.', durationMinutes: null }],
        },
        { type: 'body', metatype: RecipeWriteDto, data: '' },
      )) as RecipeWriteDto;

      await expect(service.create(ME, dto)).resolves.toBe(DETAIL);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        RecipeVersionEntity,
        expect.objectContaining({
          description: null,
          prepMinutes: null,
          cookMinutes: null,
        }),
      );
    });

    it('REC-1 returns the detail of the new recipe', async () => {
      const { service, recipes, dtos } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await expect(service.create(ME, content())).resolves.toBe(DETAIL);
      expect(dtos.toDetail).toHaveBeenCalled();
    });

    it.each([
      ['a blank title', { title: '  ' }, 'Give the recipe a title'],
      [
        'a title over 200 characters',
        { title: 'x'.repeat(201) },
        'Title can be at most 200 characters',
      ],
      [
        'a description over 500 characters',
        { description: 'x'.repeat(501) },
        'Description can be at most 500 characters',
      ],
      [
        'a category outside the 14',
        { category: 'Tacos' as Category },
        'Choose a category',
      ],
      ['zero servings', { servings: 0 }, 'Servings must be a whole number of at least 1'],
      ['2.5 servings', { servings: 2.5 }, 'Servings must be a whole number of at least 1'],
      [
        '12.5 cook minutes',
        { cookMinutes: 12.5 },
        'Cook minutes must be a whole number, 0 or more',
      ],
      [
        'a 1.5-minute step',
        { steps: [{ text: 'Rest.', durationMinutes: 1.5 }] },
        'Step 1: minutes must be a whole number of at least 1',
      ],
      ['no ingredient', { ingredients: [] }, 'Add at least one ingredient'],
      ['no step', { steps: [] }, 'Add at least one step'],
      [
        'a unit outside the fixed list',
        {
          ingredients: [
            { quantity: 1, unit: 'handful' as never, name: 'egg' },
          ],
        },
        'Choose a unit for ingredient 1',
      ],
      [
        'a blank step',
        { steps: [{ text: '  ' }] },
        'Write step 1',
      ],
    ])(
      '§3.1.1 answers 400 for %s and never opens a transaction',
      async (_name, overrides, message) => {
        const { service, dataSource } = harness();

        const error = await failureOf<BadRequestException>(
          service.create(ME, content(overrides as Partial<RecipeContent>)),
        );

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getResponse()).toEqual(
          expect.objectContaining({ message: expect.arrayContaining([message]) }),
        );
        expect(dataSource.transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('REC-6, REC-7, SAVE-5, SAVE-6 update', () => {
    it('REC-6 answers 403 when the caller is not the owner', async () => {
      const { service, recipes, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: OWNER, currentVersion: versionRow() }),
      );

      await expect(service.update(ME, 'recipe-1', content())).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.update(ME, 'recipe-1', content())).rejects.toThrow(
        'Only the owner can change this recipe',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('REC-7 appends the next version number and inherits the current image paths', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          currentVersion: versionRow({
            versionNumber: 2,
            imagePaths: ['recipes/recipe-1/a.jpg'],
          }),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 2 }));

      await service.update(ME, 'recipe-1', content({ title: 'Shakshuka v3' }));

      expect(manager.create).toHaveBeenCalledWith(
        RecipeVersionEntity,
        expect.objectContaining({
          recipeId: 'recipe-1',
          versionNumber: 3,
          imagePaths: ['recipes/recipe-1/a.jpg'],
          title: 'Shakshuka v3',
        }),
      );
    });

    it('SAVE-5, SAVE-6, SAVE-7 forks a saved copy on its first edit: forked_at now and forked_from = saved_from', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: null,
          forkedAt: null,
          currentVersion: versionRow(),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));
      const before = Date.now();

      await service.update(ME, 'recipe-1', content({ title: 'My shakshuka' }));

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        {
          currentVersionId: 'generated-1',
          forkedAt: expect.any(Date),
          forkedFromRecipeId: 'source-1',
        },
      );
      const columns = manager.update.mock.calls[0][2] as { forkedAt: Date };
      expect(columns.forkedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(columns.forkedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('CAT-7, SAVE-7 forks a saved TheMealDB copy on its first edit with forked_at only', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalId: '52772',
          externalTitle: 'Teriyaki Chicken Casserole',
          forkedAt: null,
          currentVersion: versionRow(),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await service.update(ME, 'recipe-1', content({ title: 'My casserole' }));

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: 'generated-1', forkedAt: expect.any(Date) },
      );
    });

    it('CAT-7, SAVE-7 sets nothing but the version on later edits of a TheMealDB fork', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalId: '52772',
          forkedAt: AT,
          currentVersion: versionRow({ versionNumber: 2 }),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 2 }));

      await service.update(ME, 'recipe-1', content());

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: 'generated-1' },
      );
    });

    it('SAVE-6, SAVE-7 leaves forked_at and the fork attribution untouched on later edits of a fork', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
          forkedAt: AT,
          currentVersion: versionRow({ versionNumber: 2 }),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 2 }));

      await service.update(ME, 'recipe-1', content());

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: 'generated-1' },
      );
    });

    it('REC-1 never sets a fork attribution on a recipe the owner wrote themself', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await service.update(ME, 'recipe-1', content());

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: 'generated-1' },
      );
    });

    it('§3.1.1 answers 400 for invalid content before loading the recipe', async () => {
      const { service, recipes } = harness();

      await expect(
        service.update(ME, 'recipe-1', content({ title: '' })),
      ).rejects.toThrow(BadRequestException);
      expect(recipes.findOne).not.toHaveBeenCalled();
    });
  });

  describe('REC-2, REC-3, REC-8 setVisibility', () => {
    it('REC-8 answers 400 when a recipe is shared with someone who is not a friend', async () => {
      const { service, recipes, friends, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );
      friends.friendIdsOf.mockResolvedValue(['friend-1']);

      const error = await failureOf<BadRequestException>(
        service.setVisibility(ME, 'recipe-1', 'shared', [
          'friend-1',
          'stranger-1',
        ]),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('You can only share with friends');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('§11.6, FR-1 does not name the ids that are not friends in the 400', async () => {
      const { service, recipes, friends, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );
      friends.friendIdsOf.mockResolvedValue([]);

      const error = await failureOf<BadRequestException>(
        service.setVisibility(ME, 'recipe-1', 'shared', [
          'stranger-1',
          'stranger-2',
        ]),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('You can only share with friends');
      expect(JSON.stringify(error.getResponse())).not.toContain('stranger-');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty list', [] as string[]],
      ['no list at all', undefined],
    ])(
      'UI-51 answers 400 "Pick at least one friend to share with" for shared with %s, and changes nothing',
      async (_name, sharedWithUserIds) => {
        const { service, recipes, friends, dataSource } = harness();
        recipes.findOne.mockResolvedValue(
          recipeRow({ ownerId: ME, currentVersion: versionRow() }),
        );
        friends.friendIdsOf.mockResolvedValue(['friend-1']);

        const error = await failureOf<BadRequestException>(
          service.setVisibility(ME, 'recipe-1', 'shared', sharedWithUserIds),
        );

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.getStatus()).toBe(400);
        expect(error.message).toBe('Pick at least one friend to share with');
        expect(dataSource.transaction).not.toHaveBeenCalled();
      },
    );

    it('UI-51 an empty share list never leaves the recipe shared with nobody', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, visibility: 'private', currentVersion: versionRow() }),
      );

      await expect(
        service.setVisibility(ME, 'recipe-1', 'shared', []),
      ).rejects.toThrow('Pick at least one friend to share with');

      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it('UI-51 an empty list is still fine when the recipe is made private or public', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, visibility: 'shared', currentVersion: versionRow() }),
      );

      await service.setVisibility(ME, 'recipe-1', 'private', []);
      await service.setVisibility(ME, 'recipe-1', 'public', []);

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'private' },
      );
      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'public' },
      );
    });

    it('REC-2 replaces the share rows with the chosen friends and sets the visibility', async () => {
      const { service, recipes, friends, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );
      friends.friendIdsOf.mockResolvedValue(['friend-1', 'friend-2']);

      await service.setVisibility(ME, 'recipe-1', 'shared', [
        'friend-1',
        'friend-1',
        'friend-2',
      ]);

      expect(manager.delete).toHaveBeenCalledWith(RecipeShareEntity, {
        recipeId: 'recipe-1',
      });
      expect(manager.create).toHaveBeenCalledWith(RecipeShareEntity, {
        recipeId: 'recipe-1',
        userId: 'friend-1',
      });
      expect(manager.save).toHaveBeenCalledWith([
        { recipeId: 'recipe-1', userId: 'friend-1' },
        { recipeId: 'recipe-1', userId: 'friend-2' },
      ]);
      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'shared' },
      );
    });

    it('REC-3 drops every share row when the recipe is published', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, visibility: 'shared', currentVersion: versionRow() }),
      );

      await service.setVisibility(ME, 'recipe-1', 'public');

      expect(manager.delete).toHaveBeenCalledWith(RecipeShareEntity, {
        recipeId: 'recipe-1',
      });
      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'public' },
      );
    });

    it.each([
      ['a saved copy of a user recipe', { savedFromRecipeId: 'source-1' }],
      [
        'a saved TheMealDB copy',
        { source: 'themealdb' as RecipeSource, externalId: '52772' },
      ],
    ])(
      'SAVE-8, CAT-7 answers 400 when %s is made shared or public, and changes nothing',
      async (_name, overrides) => {
        for (const visibility of ['shared', 'public'] as const) {
          const { service, recipes, friends, dataSource } = harness();
          recipes.findOne.mockResolvedValue(
            recipeRow({
              ownerId: ME,
              forkedAt: null,
              currentVersion: versionRow(),
              ...overrides,
            }),
          );
          friends.friendIdsOf.mockResolvedValue(['friend-1']);

          const error = await failureOf<BadRequestException>(
            service.setVisibility(ME, 'recipe-1', visibility, ['friend-1']),
          );

          expect(error).toBeInstanceOf(BadRequestException);
          expect(error.message).toBe(
            'A saved recipe stays private until you edit it',
          );
          expect(dataSource.transaction).not.toHaveBeenCalled();
          expect(friends.friendIdsOf).not.toHaveBeenCalled();
        }
      },
    );

    it('SAVE-8 lets a saved copy be set to private', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedAt: null,
          currentVersion: versionRow(),
        }),
      );

      await service.setVisibility(ME, 'recipe-1', 'private');

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'private' },
      );
    });

    it('SAVE-8 lets a fork be published like any own recipe', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
          forkedAt: AT,
          currentVersion: versionRow(),
        }),
      );

      await service.setVisibility(ME, 'recipe-1', 'public');

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'public' },
      );
    });

    it('SAVE-8, CAT-7 lets a TheMealDB fork be shared with friends', async () => {
      const { service, recipes, friends, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalId: '52772',
          forkedAt: AT,
          currentVersion: versionRow(),
        }),
      );
      friends.friendIdsOf.mockResolvedValue(['friend-1']);

      await service.setVisibility(ME, 'recipe-1', 'shared', ['friend-1']);

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { visibility: 'shared' },
      );
    });

    it('REC-6 answers 403 when someone other than the owner changes the visibility', async () => {
      const { service, recipes } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: OWNER, currentVersion: versionRow() }),
      );

      await expect(
        service.setVisibility(ME, 'recipe-1', 'public'),
      ).rejects.toThrow('Only the owner can change this recipe');
    });
  });

  describe('SAVE-1, SAVE-4 save', () => {
    it('SAVE-1 answers 400 for a recipe that is not public', async () => {
      const { service, recipes, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ visibility: 'private', currentVersion: versionRow() }),
      );

      await expect(service.save(ME, 'recipe-1')).rejects.toThrow(
        'Only a public recipe can be saved',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('SAVE-1 answers 400 for a recipe the caller already owns', async () => {
      const { service, recipes, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, visibility: 'public', currentVersion: versionRow() }),
      );

      await expect(service.save(ME, 'recipe-1')).rejects.toThrow(
        'You already own this recipe',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('SAVE-4 copies a public recipe into a private recipe of the caller at version 1', async () => {
      const { service, recipes, manager } = harness();
      const source = recipeRow({
        visibility: 'public',
        externalId: '52772',
        externalTitle: 'Teriyaki Chicken Casserole',
        externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
        source: 'themealdb',
        currentVersion: versionRow({ imagePaths: ['recipes/recipe-1/a.jpg'] }),
      });
      recipes.findOne
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(
          recipeRow({
            id: 'generated-1',
            ownerId: ME,
            savedFromRecipeId: 'recipe-1',
            currentVersion: versionRow(),
          }),
        );

      await service.save(ME, 'recipe-1');

      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          ownerId: ME,
          visibility: 'private',
          source: 'themealdb',
          savedFromRecipeId: 'recipe-1',
          forkedFromRecipeId: null,
          forkedAt: null,
          externalId: '52772',
          externalTitle: 'Teriyaki Chicken Casserole',
          externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
          ratingAverage: null,
          ratingCount: 0,
        }),
      );
      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        RecipeVersionEntity,
        expect.objectContaining({
          recipeId: 'generated-1',
          versionNumber: 1,
          imagePaths: ['recipes/recipe-1/a.jpg'],
          title: 'Shakshuka',
        }),
      );
    });

    it('SAVE-7, SAVE-10 stores the copy as a saved copy that took the source’s current version number', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne
        .mockResolvedValueOnce(
          recipeRow({
            visibility: 'public',
            currentVersion: versionRow({ id: 'version-3', versionNumber: 3 }),
          }),
        )
        .mockResolvedValueOnce(null)
        .mockResolvedValue(
          recipeRow({
            id: 'generated-1',
            ownerId: ME,
            savedFromRecipeId: 'recipe-1',
            currentVersion: versionRow(),
          }),
        );

      await service.save(ME, 'recipe-1');

      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          visibility: 'private',
          source: 'user',
          savedFromRecipeId: 'recipe-1',
          forkedFromRecipeId: null,
          forkedAt: null,
          syncedVersionNumber: 3,
          externalTitle: null,
        }),
      );
      // The copy's own history starts at 1 whatever the source's number is (REC-7).
      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        RecipeVersionEntity,
        expect.objectContaining({ versionNumber: 1 }),
      );
    });

    it('SAVE-7, DISC-10 looks for a live copy (saved or forked) before saving again', async () => {
      const { service, recipes } = harness();
      recipes.findOne
        .mockResolvedValueOnce(
          recipeRow({ visibility: 'public', currentVersion: versionRow() }),
        )
        .mockResolvedValueOnce(null)
        .mockResolvedValue(
          recipeRow({ id: 'generated-1', ownerId: ME, currentVersion: versionRow() }),
        );

      await service.save(ME, 'recipe-1');

      expect(recipes.findOne).toHaveBeenNthCalledWith(2, {
        where: { ownerId: ME, savedFromRecipeId: 'recipe-1', deletedAt: IsNull() },
      });
    });

    it('SAVE-1 is idempotent: a second save returns the copy that already exists', async () => {
      const { service, recipes, dataSource, dtos } = harness();
      const existing = recipeRow({
        id: 'copy-1',
        ownerId: ME,
        savedFromRecipeId: 'recipe-1',
        currentVersion: versionRow({ id: 'version-copy' }),
      });
      recipes.findOne
        .mockResolvedValueOnce(
          recipeRow({ visibility: 'public', currentVersion: versionRow() }),
        )
        .mockResolvedValueOnce(existing)
        .mockResolvedValue(existing);

      await expect(service.save(ME, 'recipe-1')).resolves.toBe(DETAIL);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(dtos.toDetail).toHaveBeenCalledWith(
        existing,
        expect.objectContaining({ id: 'version-copy' }),
        ME,
      );
    });
  });

  describe('CAT-3, CAT-4, CAT-7 saveCatalogue', () => {
    /** §3.3 field names of one TheMealDB `lookup.php?i=` record. */
    function meal(overrides: Partial<MealRecord> = {}): MealRecord {
      return {
        idMeal: '52772',
        strMeal: ' Teriyaki Chicken Casserole ',
        strCategory: 'Chicken',
        strArea: 'Japanese',
        strInstructions: 'Preheat oven to 175C.\r\nMix the sauce.',
        strMealThumb:
          'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
        strIngredient1: 'soy sauce',
        strMeasure1: '3/4 cup',
        ...overrides,
      } as MealRecord;
    }

    it('CAT-7, SAVE-9, SAVE-10 stores a private saved copy with the mapped meal name, forked_at null and no synced version', async () => {
      const { service, recipes, theMealDb, manager } = harness();
      theMealDb.lookup.mockResolvedValue(meal());
      recipes.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(
          recipeRow({
            id: 'generated-1',
            ownerId: ME,
            source: 'themealdb',
            currentVersion: versionRow(),
          }),
        );

      await service.saveCatalogue(ME, '52772');

      expect(theMealDb.lookup).toHaveBeenCalledWith('52772');
      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          ownerId: ME,
          visibility: 'private',
          source: 'themealdb',
          savedFromRecipeId: null,
          forkedFromRecipeId: null,
          forkedAt: null,
          syncedVersionNumber: null,
          externalId: '52772',
          externalTitle: 'Teriyaki Chicken Casserole',
          externalImageUrl:
            'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
        }),
      );
      expect(manager.create).toHaveBeenNthCalledWith(
        2,
        RecipeVersionEntity,
        expect.objectContaining({
          versionNumber: 1,
          title: 'Teriyaki Chicken Casserole',
          servings: 2,
          imagePaths: [],
        }),
      );
    });

    it('CAT-7 keeps one live copy per meal per user: a second save returns it without a lookup', async () => {
      const { service, recipes, theMealDb, dataSource, dtos } = harness();
      const existing = recipeRow({
        id: 'copy-1',
        ownerId: ME,
        source: 'themealdb',
        externalId: '52772',
        currentVersion: versionRow({ id: 'version-copy' }),
      });
      recipes.findOne.mockResolvedValue(existing);

      await expect(service.saveCatalogue(ME, '52772')).resolves.toBe(DETAIL);

      expect(recipes.findOne).toHaveBeenNthCalledWith(1, {
        where: {
          ownerId: ME,
          source: 'themealdb',
          externalId: '52772',
          savedFromRecipeId: IsNull(),
          deletedAt: IsNull(),
        },
      });
      expect(theMealDb.lookup).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(dtos.toDetail).toHaveBeenCalledWith(existing, expect.anything(), ME);
    });

    it('CAT-7, DISC-10 does not count a copy of another user’s published TheMealDB fork as the meal’s copy', async () => {
      const { service, recipes, theMealDb, manager } = harness();
      theMealDb.lookup.mockResolvedValue(meal());
      // The only row with this idMeal is a saved copy of someone's fork, which the
      // `savedFromRecipeId IS NULL` filter keeps out, so the lookup finds nothing.
      recipes.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue(
          recipeRow({
            id: 'generated-1',
            ownerId: ME,
            source: 'themealdb',
            currentVersion: versionRow(),
          }),
        );

      await service.saveCatalogue(ME, '52772');

      const [firstCall] = recipes.findOne.mock.calls as [
        { where: Record<string, unknown> },
      ][];
      expect(firstCall[0].where['savedFromRecipeId']).toEqual(IsNull());
      expect(theMealDb.lookup).toHaveBeenCalledWith('52772');
      expect(manager.create).toHaveBeenNthCalledWith(
        1,
        RecipeEntity,
        expect.objectContaining({
          source: 'themealdb',
          externalId: '52772',
          savedFromRecipeId: null,
        }),
      );
    });

    /** The version row `saveCatalogue` created (the second `manager.create`). */
    function savedVersion(manager: Harness['manager']): RecipeContent {
      const [, data] = manager.create.mock.calls[1] as [unknown, RecipeContent];
      return data;
    }

    function savedCopyRow(): RecipeEntity {
      return recipeRow({
        id: 'generated-1',
        ownerId: ME,
        source: 'themealdb',
        currentVersion: versionRow(),
      });
    }

    it('§3.1.1 keeps the first 60 steps of a meal whose instructions split into more', async () => {
      const { service, recipes, theMealDb, manager } = harness();
      const lines = Array.from(
        { length: 70 },
        (_, index) => `Instruction number ${index + 1}.`,
      );
      theMealDb.lookup.mockResolvedValue(
        meal({ strInstructions: lines.join('\r\n') }),
      );
      recipes.findOne.mockResolvedValueOnce(null).mockResolvedValue(savedCopyRow());

      await service.saveCatalogue(ME, '52772');

      const version = savedVersion(manager);
      expect(version.steps).toHaveLength(MAX_STEPS);
      expect(MAX_STEPS).toBe(60);
      expect(version.steps.map((step) => step.text)).toEqual(lines.slice(0, 60));
    });

    it('§3.1.1 keeps the first 50 ingredients when the mapped meal has more', async () => {
      const { service, recipes, theMealDb, manager } = harness();
      theMealDb.lookup.mockResolvedValue(meal());
      const ingredients = Array.from({ length: 55 }, (_, index) => ({
        quantity: 1,
        unit: 'piece' as const,
        name: `ingredient ${index + 1}`,
      }));
      mapperMocks.toRecipeContent.mockReturnValueOnce(
        content({ ingredients, steps: [{ text: 'Mix.' }] }),
      );
      recipes.findOne.mockResolvedValueOnce(null).mockResolvedValue(savedCopyRow());

      await service.saveCatalogue(ME, '52772');

      const version = savedVersion(manager);
      expect(version.ingredients).toHaveLength(MAX_INGREDIENTS);
      expect(MAX_INGREDIENTS).toBe(50);
      expect(version.ingredients).toEqual(ingredients.slice(0, 50));
    });

    it('§3.1.1 keeps a meal within the limits whole', async () => {
      const { service, recipes, theMealDb, manager } = harness();
      theMealDb.lookup.mockResolvedValue(meal());
      recipes.findOne.mockResolvedValueOnce(null).mockResolvedValue(savedCopyRow());

      await service.saveCatalogue(ME, '52772');

      const version = savedVersion(manager);
      expect(version.steps.map((step) => step.text)).toEqual([
        'Preheat oven to 175C.',
        'Mix the sauce.',
      ]);
      expect(version.ingredients).toEqual([
        { name: 'soy sauce', quantity: 0.75, unit: 'cup' },
      ]);
    });

    it('CAT-3 answers 404 when TheMealDB knows no such meal', async () => {
      const { service, theMealDb, dataSource } = harness();
      theMealDb.lookup.mockResolvedValue(null);

      await expect(service.saveCatalogue(ME, '99999')).rejects.toThrow(
        'TheMealDB has no meal 99999',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('SAVE-10 sync', () => {
    const SOURCE_VERSION = versionRow({
      id: 'source-version-3',
      recipeId: 'source-1',
      versionNumber: 3,
      title: 'Shakshuka deluxe',
      description: 'Spicier',
      prepMinutes: 5,
      imagePaths: ['recipes/source-1/a.jpg'],
    });

    function copyRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
      return recipeRow({
        id: 'copy-1',
        ownerId: ME,
        savedFromRecipeId: 'source-1',
        syncedVersionNumber: 2,
        currentVersion: versionRow({ id: 'copy-version', recipeId: 'copy-1' }),
        ...overrides,
      });
    }

    function sourceRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
      return recipeRow({
        id: 'source-1',
        ownerId: OWNER,
        visibility: 'public',
        currentVersionId: SOURCE_VERSION.id,
        currentVersion: SOURCE_VERSION,
        ...overrides,
      });
    }

    /** loadOrThrow(copy), the source lookup, then loadOrThrow(copy) again inside get(). */
    function load(
      h: Harness,
      copy: RecipeEntity,
      source: RecipeEntity | null,
    ): void {
      h.recipes.findOne
        .mockResolvedValueOnce(copy)
        .mockResolvedValueOnce(source)
        .mockResolvedValue(copy);
    }

    it('SAVE-10 appends a version holding the source’s current content and images, and records its number', async () => {
      const h = harness();
      load(h, copyRow(), sourceRow());
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 4 }));

      await h.service.sync(ME, 'copy-1');

      expect(h.recipes.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: 'source-1', deletedAt: IsNull() },
        relations: { currentVersion: true },
      });
      expect(h.manager.create).toHaveBeenCalledWith(
        RecipeVersionEntity,
        expect.objectContaining({
          recipeId: 'copy-1',
          versionNumber: 5,
          imagePaths: ['recipes/source-1/a.jpg'],
          title: 'Shakshuka deluxe',
          description: 'Spicier',
          category: 'Breakfast',
          servings: 2,
          prepMinutes: 5,
          cookMinutes: null,
          ingredients: SOURCE_VERSION.ingredients,
          steps: SOURCE_VERSION.steps,
        }),
      );
      expect(h.manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'copy-1' },
        { currentVersionId: 'generated-1', syncedVersionNumber: 3 },
      );
    });

    it('SAVE-7, SAVE-10 keeps a saved copy saved: a sync never sets forked_at or forked_from', async () => {
      const h = harness();
      load(h, copyRow({ forkedAt: null }), sourceRow());
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await h.service.sync(ME, 'copy-1');

      expect(h.manager.update).toHaveBeenCalledTimes(1);
      const columns = h.manager.update.mock.calls[0][2] as Record<string, unknown>;
      expect(columns).not.toHaveProperty('forkedAt');
      expect(columns).not.toHaveProperty('forkedFromRecipeId');
    });

    it('SAVE-10 syncs a fork too, and it stays a fork', async () => {
      const h = harness();
      load(
        h,
        copyRow({ forkedAt: AT, forkedFromRecipeId: 'source-1' }),
        sourceRow(),
      );
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 2 }));

      await h.service.sync(ME, 'copy-1');

      expect(h.manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'copy-1' },
        { currentVersionId: 'generated-1', syncedVersionNumber: 3 },
      );
    });

    it('SAVE-10 syncs from a source shared with the caller', async () => {
      const h = harness();
      load(h, copyRow(), sourceRow({ visibility: 'shared' }));
      h.shares.exists.mockResolvedValue(true);
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await h.service.sync(ME, 'copy-1');

      expect(h.shares.exists).toHaveBeenCalledWith({
        where: { recipeId: 'source-1', userId: ME },
      });
      expect(h.manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'copy-1' },
        { currentVersionId: 'generated-1', syncedVersionNumber: 3 },
      );
    });

    it('SAVE-10 returns the detail of the copy', async () => {
      const h = harness();
      const copy = copyRow();
      load(h, copy, sourceRow());
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await expect(h.service.sync(ME, 'copy-1')).resolves.toBe(DETAIL);
      expect(h.dtos.toDetail).toHaveBeenCalledWith(copy, expect.anything(), ME);
    });

    it('SAVE-10, REC-6 answers 403 when the caller does not own the copy', async () => {
      const h = harness();
      load(h, copyRow({ ownerId: OWNER }), sourceRow());

      await expect(h.service.sync(ME, 'copy-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(h.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('SAVE-10, CAT-7 answers 400 for a TheMealDB copy, which is never checked, without looking for a source', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(
        copyRow({
          savedFromRecipeId: null,
          source: 'themealdb',
          externalId: '52772',
          syncedVersionNumber: null,
        }),
      );

      const error = await failureOf<BadRequestException>(
        h.service.sync(ME, 'copy-1'),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('This recipe has no update to take');
      expect(h.recipes.findOne).toHaveBeenCalledTimes(1);
      expect(h.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('SAVE-10 answers 400 for a recipe the caller wrote themself', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(copyRow({ savedFromRecipeId: null }));

      await expect(h.service.sync(ME, 'copy-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(h.dataSource.transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['the source is deleted or missing', () => null, 2],
      [
        'the caller can no longer view the source',
        () => sourceRow({ visibility: 'private' }),
        2,
      ],
      [
        'the source is shared, but not with the caller',
        () => sourceRow({ visibility: 'shared' }),
        2,
      ],
      ['the copy is at the source’s version', () => sourceRow(), 3],
      ['the copy is past the source’s version', () => sourceRow(), 4],
      ['the copy never recorded a source version', () => sourceRow(), null],
    ] as [string, () => RecipeEntity | null, number | null][])(
      'SAVE-10 answers 400 when %s',
      async (_name, source, synced) => {
        const h = harness();
        load(h, copyRow({ syncedVersionNumber: synced }), source());

        const error = await failureOf<BadRequestException>(
          h.service.sync(ME, 'copy-1'),
        );

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe('This recipe has no update to take');
        expect(h.dataSource.transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('IMG-6 addImage', () => {
    it('IMG-6 stores the object path on the current version and returns the signed URLs', async () => {
      const { service, recipes, versions, images } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          currentVersion: versionRow({ imagePaths: ['recipes/recipe-1/a.jpg'] }),
        }),
      );
      images.signedUrls.mockResolvedValue([
        'https://signed.example/a',
        'https://signed.example/new',
      ]);

      const result = await service.addImage(ME, 'recipe-1', {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'shakshuka.jpg',
      });

      expect(images.upload).toHaveBeenCalledWith({
        recipeId: 'recipe-1',
        buffer: Buffer.from('jpeg-bytes'),
        mimeType: 'image/jpeg',
        originalName: 'shakshuka.jpg',
      });
      expect(versions.update).toHaveBeenCalledWith(
        { id: 'version-1' },
        { imagePaths: ['recipes/recipe-1/a.jpg', 'recipes/recipe-1/new.jpg'] },
      );
      expect(result).toEqual({
        imageUrls: ['https://signed.example/a', 'https://signed.example/new'],
      });
    });

    it('IMG-6 answers 400 for the fourth image and uploads nothing', async () => {
      const { service, recipes, images, versions } = harness();
      const full = Array.from(
        { length: MAX_IMAGES_PER_RECIPE },
        (_value, index) => `recipes/recipe-1/${index}.jpg`,
      );
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow({ imagePaths: full }) }),
      );

      const error = await failureOf<BadRequestException>(
        service.addImage(ME, 'recipe-1', {
          buffer: Buffer.from('jpeg-bytes'),
          mimetype: 'image/jpeg',
          originalname: 'fourth.jpg',
        }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('A recipe version carries at most 3 images');
      expect(images.upload).not.toHaveBeenCalled();
      expect(versions.update).not.toHaveBeenCalled();
    });

    it('IMG-3, REC-6 answers 403 when someone other than the owner uploads', async () => {
      const { service, recipes, images } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: OWNER, currentVersion: versionRow() }),
      );

      await expect(
        service.addImage(ME, 'recipe-1', {
          buffer: Buffer.from('jpeg-bytes'),
          mimetype: 'image/jpeg',
          originalname: 'nope.jpg',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(images.upload).not.toHaveBeenCalled();
    });
  });

  describe('IMG-3, IMG-7 removeImage', () => {
    /** The owned-image statement, compared with its whitespace collapsed. */
    const SWEEP =
      'UPDATE "recipe_versions" SET "image_paths" = array_remove("image_paths", $1), "updated_at" = now() WHERE $1 = ANY("image_paths")';

    function sweepCalls(h: Harness): [string, unknown[]][] {
      return h.dataSource.query.mock.calls.map(
        ([sql, parameters]: [string, unknown[]]) => [
          sql.replace(/\s+/g, ' ').trim(),
          parameters,
        ],
      );
    }

    /** A saved copy of source-1 that links the source's image and owns one of its own. */
    function copyWithImages(h: Harness, ownerId = ME): void {
      h.recipes.findOne.mockResolvedValue(
        recipeRow({
          id: 'copy-1',
          ownerId,
          savedFromRecipeId: 'source-1',
          syncedVersionNumber: 1,
          currentVersionId: 'copy-version-1',
          currentVersion: versionRow({
            id: 'copy-version-1',
            recipeId: 'copy-1',
            imagePaths: ['recipes/source-1/a.jpg', 'recipes/copy-1/b.jpg'],
          }),
        }),
      );
    }

    it('IMG-7 drops a linked image (owned by the source) from the copy’s current version only', async () => {
      const h = harness();
      copyWithImages(h);

      await h.service.removeImage(ME, 'copy-1', 0);

      expect(h.versions.update).toHaveBeenCalledTimes(1);
      expect(h.versions.update).toHaveBeenCalledWith(
        { id: 'copy-version-1' },
        { imagePaths: ['recipes/copy-1/b.jpg'] },
      );
      expect(h.dataSource.query).not.toHaveBeenCalled();
    });

    it('IMG-7 leaves a linked image’s object in the bucket', async () => {
      const h = harness();
      copyWithImages(h);

      await h.service.removeImage(ME, 'copy-1', 0);

      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 returns the signed URLs of the paths left after dropping a linked image', async () => {
      const h = harness();
      copyWithImages(h);
      h.images.signedUrls.mockResolvedValue(['https://signed.example/b']);

      const result = await h.service.removeImage(ME, 'copy-1', 0);

      expect(h.images.signedUrls).toHaveBeenCalledWith(['recipes/copy-1/b.jpg']);
      expect(result).toEqual({ imageUrls: ['https://signed.example/b'] });
    });

    it('IMG-7 treats a path under another recipe whose id only starts with this id as linked', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          currentVersion: versionRow({
            imagePaths: ['recipes/recipe-10/a.jpg'],
          }),
        }),
      );

      await h.service.removeImage(ME, 'recipe-1', 0);

      expect(h.versions.update).toHaveBeenCalledWith(
        { id: 'version-1' },
        { imagePaths: [] },
      );
      expect(h.dataSource.query).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 drops an owned image from every version of every recipe that carries it', async () => {
      const h = harness();
      copyWithImages(h);

      await h.service.removeImage(ME, 'copy-1', 1);

      expect(h.dataSource.query).toHaveBeenCalledTimes(1);
      expect(sweepCalls(h)).toEqual([[SWEEP, ['recipes/copy-1/b.jpg']]]);
      expect(h.versions.update).not.toHaveBeenCalled();
    });

    it('IMG-3, IMG-7 deletes an owned image’s object after sweeping it out of the versions', async () => {
      const h = harness();
      copyWithImages(h);

      await h.service.removeImage(ME, 'copy-1', 1);

      expect(h.images.remove).toHaveBeenCalledTimes(1);
      expect(h.images.remove).toHaveBeenCalledWith('recipes/copy-1/b.jpg');
      expect(h.dataSource.query.mock.invocationCallOrder[0]).toBeLessThan(
        h.images.remove.mock.invocationCallOrder[0],
      );
    });

    it('IMG-7 deletes the object of an own recipe’s image that copies link to', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(
        recipeRow({
          id: 'source-1',
          ownerId: ME,
          visibility: 'public',
          currentVersionId: 'source-version-2',
          currentVersion: versionRow({
            id: 'source-version-2',
            recipeId: 'source-1',
            versionNumber: 2,
            imagePaths: ['recipes/source-1/a.jpg'],
          }),
        }),
      );

      await h.service.removeImage(ME, 'source-1', 0);

      expect(sweepCalls(h)).toEqual([[SWEEP, ['recipes/source-1/a.jpg']]]);
      expect(h.images.remove).toHaveBeenCalledWith('recipes/source-1/a.jpg');
    });

    describe('IMG-7 a bucket delete that fails', () => {
      afterEach(() => jest.restoreAllMocks());

      it('IMG-7 still resolves with the remaining URLs when the object cannot be deleted', async () => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const h = harness();
        copyWithImages(h);
        h.images.remove.mockRejectedValue(new Error('bucket unavailable'));
        h.images.signedUrls.mockResolvedValue(['https://signed.example/a']);

        const result = await h.service.removeImage(ME, 'copy-1', 1);

        expect(result).toEqual({ imageUrls: ['https://signed.example/a'] });
        expect(h.images.signedUrls).toHaveBeenCalledWith([
          'recipes/source-1/a.jpg',
        ]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('recipes/copy-1/b.jpg'),
        );
      });

      it('IMG-7 has already dropped the path from every version when the object delete fails', async () => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        const h = harness();
        copyWithImages(h);
        h.images.remove.mockRejectedValue(new Error('bucket unavailable'));

        await h.service.removeImage(ME, 'copy-1', 1);

        expect(sweepCalls(h)).toEqual([[SWEEP, ['recipes/copy-1/b.jpg']]]);
        expect(h.dataSource.query.mock.invocationCallOrder[0]).toBeLessThan(
          h.images.remove.mock.invocationCallOrder[0],
        );
      });

      it('IMG-7 still resolves and logs when the failure is not an Error', async () => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const h = harness();
        copyWithImages(h);
        h.images.remove.mockRejectedValue('timeout');

        await expect(h.service.removeImage(ME, 'copy-1', 1)).resolves.toEqual({
          imageUrls: [],
        });
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('recipes/copy-1/b.jpg'),
        );
      });

      it('IMG-7 does not log when the object is deleted', async () => {
        const warn = jest
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const h = harness();
        copyWithImages(h);

        await h.service.removeImage(ME, 'copy-1', 1);

        expect(warn).not.toHaveBeenCalled();
      });
    });

    it('IMG-7 returns the signed URLs of the paths left after deleting an owned image', async () => {
      const h = harness();
      copyWithImages(h);
      h.images.signedUrls.mockResolvedValue(['https://signed.example/a']);

      const result = await h.service.removeImage(ME, 'copy-1', 1);

      expect(h.images.signedUrls).toHaveBeenCalledWith(['recipes/source-1/a.jpg']);
      expect(result).toEqual({ imageUrls: ['https://signed.example/a'] });
    });

    it('IMG-4 returns no URLs and asks for none when the last image is removed', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          currentVersion: versionRow({ imagePaths: ['recipes/recipe-1/a.jpg'] }),
        }),
      );

      const result = await h.service.removeImage(ME, 'recipe-1', 0);

      expect(h.images.signedUrls).not.toHaveBeenCalled();
      expect(result).toEqual({ imageUrls: [] });
    });

    it.each([
      ['past the last image', 2],
      ['negative', -1],
      ['not a whole number', 0.5],
    ])('IMG-3 answers 400 for an index %s and changes nothing', async (_name, index) => {
      const h = harness();
      copyWithImages(h);

      const error = await failureOf<BadRequestException>(
        h.service.removeImage(ME, 'copy-1', index),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(`This recipe has no image ${index}`);
      expect(h.versions.update).not.toHaveBeenCalled();
      expect(h.dataSource.query).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it.each([
      ['a linked image', 0],
      ['an owned image', 1],
    ])('IMG-3, REC-6 answers 403 when someone other than the owner removes %s', async (_name, index) => {
      const h = harness();
      copyWithImages(h, OWNER);

      await expect(h.service.removeImage(ME, 'copy-1', index)).rejects.toThrow(
        ForbiddenException,
      );
      expect(h.versions.update).not.toHaveBeenCalled();
      expect(h.dataSource.query).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });
  });

  describe('REC-6, SAVE-4, SAVE-7 remove', () => {
    it('§12.1 soft-deletes an own recipe so saved copies keep their attribution', async () => {
      const { service, recipes, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await service.remove(ME, 'recipe-1');

      expect(recipes.update).toHaveBeenCalledWith(
        { id: 'recipe-1' },
        { deletedAt: expect.any(Date) },
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('SAVE-4 deletes a saved copy outright after clearing its current version', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          currentVersion: versionRow(),
        }),
      );

      await service.remove(ME, 'recipe-1');

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: null },
      );
      expect(manager.delete).toHaveBeenCalledWith(RecipeEntity, {
        id: 'recipe-1',
      });
      expect(recipes.update).not.toHaveBeenCalled();
    });

    it('SAVE-7, CAT-7 deletes a saved TheMealDB copy outright', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalId: '52772',
          forkedAt: null,
          currentVersion: versionRow(),
        }),
      );

      await service.remove(ME, 'recipe-1');

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: null },
      );
      expect(manager.delete).toHaveBeenCalledWith(RecipeEntity, {
        id: 'recipe-1',
      });
      expect(recipes.update).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a fork of a user recipe',
        { savedFromRecipeId: 'source-1', forkedFromRecipeId: 'source-1' },
      ],
      [
        'a fork of a TheMealDB meal',
        { source: 'themealdb' as RecipeSource, externalId: '52772' },
      ],
    ])('SAVE-7 soft-deletes %s like an own recipe', async (_name, overrides) => {
      const { service, recipes, dataSource, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          forkedAt: AT,
          currentVersion: versionRow(),
          ...overrides,
        }),
      );

      await service.remove(ME, 'recipe-1');

      expect(recipes.update).toHaveBeenCalledWith(
        { id: 'recipe-1' },
        { deletedAt: expect.any(Date) },
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    });

    it.each([
      ['an own recipe', {}],
      [
        'a fork of a user recipe',
        {
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
          forkedAt: AT,
        },
      ],
      [
        'a fork of a TheMealDB meal',
        {
          source: 'themealdb' as RecipeSource,
          externalId: '52772',
          forkedAt: AT,
        },
      ],
    ])('IMG-7, SAVE-7 keeps the image objects of %s it soft-deletes while a live copy shows them', async (_name, overrides) => {
      const h = harness();
      const soft = recipeRow({
        id: RELEASE_OWN_ID,
        ownerId: ME,
        currentVersion: versionRow({
          recipeId: RELEASE_OWN_ID,
          imagePaths: [RELEASE_OWN_IMG],
        }),
        ...overrides,
      });
      routeFindOne(h, {
        load: soft,
        owners: { [RELEASE_OWN_ID]: { id: RELEASE_OWN_ID, deletedAt: AT } },
      });
      routeQueries(h, { [RELEASE_OWN_IMG]: true });
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [RELEASE_OWN_IMG] }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      expect(existsChecks(h)).toEqual([RELEASE_OWN_IMG]);
      expect(sweptPaths(h)).toEqual([]);
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    describe('IMG-7, SAVE-7 image objects of a saved copy', () => {
      function savedCopy(h: Harness): void {
        h.recipes.findOne.mockResolvedValue(
          recipeRow({
            id: 'copy-1',
            ownerId: ME,
            savedFromRecipeId: 'source-1',
            syncedVersionNumber: 2,
            currentVersionId: 'copy-version-2',
            currentVersion: versionRow({
              id: 'copy-version-2',
              recipeId: 'copy-1',
              versionNumber: 2,
              imagePaths: ['recipes/source-1/a.jpg', 'recipes/copy-1/c.jpg'],
            }),
          }),
        );
        h.versions.find.mockResolvedValue([
          versionRow({
            id: 'copy-version-1',
            recipeId: 'copy-1',
            versionNumber: 1,
            imagePaths: ['recipes/source-1/a.jpg', 'recipes/copy-1/b.jpg'],
          }),
          versionRow({
            id: 'copy-version-2',
            recipeId: 'copy-1',
            versionNumber: 2,
            imagePaths: [
              'recipes/source-1/a.jpg',
              'recipes/copy-1/b.jpg',
              'recipes/copy-1/c.jpg',
            ],
          }),
          versionRow({
            id: 'copy-version-3',
            recipeId: 'copy-1',
            versionNumber: 3,
            imagePaths: null as unknown as string[],
          }),
        ]);
      }

      it('IMG-7, SAVE-7 reads the image paths of every version of the copy', async () => {
        const h = harness();
        savedCopy(h);

        await h.service.remove(ME, 'copy-1');

        expect(h.versions.find).toHaveBeenCalledWith(
          expect.objectContaining({ where: { recipeId: 'copy-1' } }),
        );
      });

      it('IMG-7, SAVE-7 deletes each object the copy owns once, across all its versions', async () => {
        const h = harness();
        savedCopy(h);

        await h.service.remove(ME, 'copy-1');

        expect(h.images.remove).toHaveBeenCalledTimes(2);
        expect(h.images.remove).toHaveBeenCalledWith('recipes/copy-1/b.jpg');
        expect(h.images.remove).toHaveBeenCalledWith('recipes/copy-1/c.jpg');
      });

      it('IMG-7, SAVE-7 leaves the source’s linked objects in the bucket', async () => {
        const h = harness();
        savedCopy(h);

        await h.service.remove(ME, 'copy-1');

        expect(h.images.remove).not.toHaveBeenCalledWith('recipes/source-1/a.jpg');
      });

      it('IMG-7, SAVE-7 still hard-deletes the row, and deletes the objects after it', async () => {
        const h = harness();
        savedCopy(h);

        await h.service.remove(ME, 'copy-1');

        expect(h.manager.update).toHaveBeenCalledWith(
          RecipeEntity,
          { id: 'copy-1' },
          { currentVersionId: null },
        );
        expect(h.manager.delete).toHaveBeenCalledWith(RecipeEntity, {
          id: 'copy-1',
        });
        expect(h.recipes.update).not.toHaveBeenCalled();
        expect(h.manager.delete.mock.invocationCallOrder[0]).toBeLessThan(
          h.images.remove.mock.invocationCallOrder[0],
        );
      });

      it('IMG-7, SAVE-7 deletes no object when the row could not be deleted', async () => {
        const h = harness();
        savedCopy(h);
        h.manager.delete.mockRejectedValue(new Error('delete failed'));

        await expect(h.service.remove(ME, 'copy-1')).rejects.toThrow(
          'delete failed',
        );
        expect(h.images.remove).not.toHaveBeenCalled();
      });

      describe('IMG-7 a bucket delete that fails', () => {
        afterEach(() => jest.restoreAllMocks());

        it('IMG-7, SAVE-7 still resolves and still tries every other owned object', async () => {
          const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
          const h = harness();
          savedCopy(h);
          h.images.remove.mockImplementation((path: string) =>
            path === 'recipes/copy-1/b.jpg'
              ? Promise.reject(new Error('bucket unavailable'))
              : Promise.resolve(undefined),
          );

          await expect(h.service.remove(ME, 'copy-1')).resolves.toBeUndefined();

          expect(h.images.remove).toHaveBeenCalledTimes(2);
          expect(h.images.remove).toHaveBeenCalledWith('recipes/copy-1/b.jpg');
          expect(h.images.remove).toHaveBeenCalledWith('recipes/copy-1/c.jpg');
          expect(warn).toHaveBeenCalledTimes(1);
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('recipes/copy-1/b.jpg'),
          );
        });

        it('IMG-7, SAVE-7 still resolves when every owned object fails, and logs each one', async () => {
          const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
          const h = harness();
          savedCopy(h);
          h.images.remove.mockRejectedValue(new Error('bucket unavailable'));

          await expect(h.service.remove(ME, 'copy-1')).resolves.toBeUndefined();

          expect(h.images.remove).toHaveBeenCalledTimes(2);
          expect(warn).toHaveBeenCalledTimes(2);
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('recipes/copy-1/b.jpg'),
          );
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('recipes/copy-1/c.jpg'),
          );
        });

        it('IMG-7, SAVE-7 has already hard-deleted the row when an object delete fails', async () => {
          jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
          const h = harness();
          savedCopy(h);
          h.images.remove.mockRejectedValue(new Error('bucket unavailable'));

          await h.service.remove(ME, 'copy-1');

          expect(h.manager.delete).toHaveBeenCalledWith(RecipeEntity, {
            id: 'copy-1',
          });
          expect(h.manager.delete.mock.invocationCallOrder[0]).toBeLessThan(
            h.images.remove.mock.invocationCallOrder[0],
          );
        });
      });

      it('IMG-7, SAVE-7, CAT-7 deletes no object for a saved TheMealDB copy with only its external image', async () => {
        const h = harness();
        h.recipes.findOne.mockResolvedValue(
          recipeRow({
            ownerId: ME,
            source: 'themealdb',
            externalId: '52772',
            forkedAt: null,
            currentVersion: versionRow(),
          }),
        );
        h.versions.find.mockResolvedValue([versionRow()]);

        await h.service.remove(ME, 'recipe-1');

        expect(h.manager.delete).toHaveBeenCalledWith(RecipeEntity, {
          id: 'recipe-1',
        });
        expect(h.images.remove).not.toHaveBeenCalled();
      });
    });

    it('REC-6 answers 403 when someone other than the owner removes a recipe', async () => {
      const { service, recipes, dataSource } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: OWNER, currentVersion: versionRow() }),
      );

      await expect(service.remove(ME, 'recipe-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(recipes.update).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('IMG-7, REC-6 deletes no object when someone other than the owner removes a saved copy', async () => {
      const h = harness();
      h.recipes.findOne.mockResolvedValue(
        recipeRow({
          id: 'copy-1',
          ownerId: OWNER,
          savedFromRecipeId: 'source-1',
          currentVersion: versionRow({ imagePaths: ['recipes/copy-1/b.jpg'] }),
        }),
      );
      h.versions.find.mockResolvedValue([
        versionRow({ imagePaths: ['recipes/copy-1/b.jpg'] }),
      ]);

      await expect(h.service.remove(ME, 'copy-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(h.dataSource.transaction).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });
  });
});

describe('RecipesService IMG-7 release of images no live recipe shows (2026-09-30, BUG-028)', () => {
  const SWEEP =
    'UPDATE "recipe_versions" SET "image_paths" = array_remove("image_paths", $1), "updated_at" = now() WHERE $1 = ANY("image_paths")';

  afterEach(() => jest.restoreAllMocks());

  function quietWarn(): jest.SpyInstance {
    return jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  }

  /** A saved copy of the source that links the source's image and owns one of its own. */
  function copyRecipe(imagePaths = [RELEASE_SOURCE_IMG, RELEASE_COPY_IMG]): RecipeEntity {
    return recipeRow({
      id: RELEASE_COPY_ID,
      ownerId: ME,
      savedFromRecipeId: RELEASE_SOURCE_ID,
      syncedVersionNumber: 2,
      currentVersionId: 'copy-version-2',
      currentVersion: versionRow({
        id: 'copy-version-2',
        recipeId: RELEASE_COPY_ID,
        versionNumber: 2,
        imagePaths,
      }),
    });
  }

  const LIVE = (id: string): OwnerRow => ({ id, deletedAt: null });
  const SOFT_DELETED = (id: string): OwnerRow => ({ id, deletedAt: AT });

  describe('after an image removal on a copy', () => {
    it('IMG-7 releases a linked image whose owner is soft-deleted and that no live current version shows: swept everywhere, then deleted', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(h.versions.update).toHaveBeenCalledWith(
        { id: 'copy-version-2' },
        { imagePaths: [RELEASE_COPY_IMG] },
      );
      expect(existsChecks(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(sweptPaths(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(h.images.remove).toHaveBeenCalledTimes(1);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_SOURCE_IMG);
    });

    it('IMG-7 changes the database first: the copy update, the check and the sweep come before the bucket delete', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      const [checkOrder, sweepOrder] = h.dataSource.query.mock.invocationCallOrder;
      expect(h.versions.update.mock.invocationCallOrder[0]).toBeLessThan(checkOrder);
      expect(checkOrder).toBeLessThan(sweepOrder);
      expect(sweepOrder).toBeLessThan(h.images.remove.mock.invocationCallOrder[0]);
    });

    it('IMG-7 releases a linked image whose owning recipe is gone (no row)', async () => {
      const h = harness();
      routeFindOne(h, { load: copyRecipe(), owners: { [RELEASE_SOURCE_ID]: null } });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(sweptPaths(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_SOURCE_IMG);
    });

    it('IMG-7 keeps a linked image of a soft-deleted owner while a live recipe current version still shows it', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h, { [RELEASE_SOURCE_IMG]: true });

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(existsChecks(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(sweptPaths(h)).toEqual([]);
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 leaves a linked image of a live owner alone without asking who shows it: only the owner deletes it', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: LIVE(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(ownerLookups(h)).toEqual([RELEASE_SOURCE_ID]);
      expect(existsChecks(h)).toEqual([]);
      expect(sweptPaths(h)).toEqual([]);
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 looks the owner up by the <recipeId> of the path, reading only its id and deleted_at', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: LIVE(RELEASE_SOURCE_ID) },
      });

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(h.recipes.findOne).toHaveBeenCalledWith({
        where: { id: RELEASE_SOURCE_ID },
        select: { id: true, deletedAt: true },
      });
    });

    it('IMG-7 counts only current versions of live recipes as showing a path', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      const [sql, parameters] = (h.dataSource.query.mock.calls as [string, unknown[]][]).find(
        ([text]) => text.includes('SELECT EXISTS'),
      ) as [string, unknown[]];
      const collapsed = sql.replace(/\s+/g, ' ');
      expect(collapsed).toContain('"live"."deleted_at" IS NULL');
      expect(collapsed).toContain(
        '"shown_version"."id" = "live"."current_version_id"',
      );
      expect(collapsed).toContain('$1 = ANY("shown_version"."image_paths")');
      expect(parameters).toEqual([RELEASE_SOURCE_IMG]);
    });

    it('IMG-7 drops the released path with the same every-version sweep as the owner removal', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      const sweep = (h.dataSource.query.mock.calls as [string, unknown[]][]).find(
        ([text]) => text.includes('array_remove'),
      ) as [string, unknown[]];
      expect(sweep[0].replace(/\s+/g, ' ').trim()).toBe(SWEEP);
      expect(sweep[1]).toEqual([RELEASE_SOURCE_IMG]);
    });

    it('IMG-7 does not check a path outside the IMG-6 shape (no <recipeId> UUID)', async () => {
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(['recipes/source-1/a.jpg', RELEASE_COPY_IMG]),
      });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 0);

      expect(ownerLookups(h)).toEqual([]);
      expect(h.dataSource.query).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 an owner removal of its own image sweeps and deletes without the release check', async () => {
      const h = harness();
      routeFindOne(h, { load: copyRecipe() });
      routeQueries(h);

      await h.service.removeImage(ME, RELEASE_COPY_ID, 1);

      expect(ownerLookups(h)).toEqual([]);
      expect(existsChecks(h)).toEqual([]);
      expect(sweptPaths(h)).toEqual([RELEASE_COPY_IMG]);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_COPY_IMG);
    });

    it('IMG-7 a failed owner lookup is logged with the path and the error message, and the request succeeds', async () => {
      const warn = quietWarn();
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        ownerError: new Error('connection reset'),
      });
      h.images.signedUrls.mockResolvedValue(['https://signed.example/copy']);

      await expect(h.service.removeImage(ME, RELEASE_COPY_ID, 0)).resolves.toEqual({
        imageUrls: ['https://signed.example/copy'],
      });
      expect(h.versions.update).toHaveBeenCalledWith(
        { id: 'copy-version-2' },
        { imagePaths: [RELEASE_COPY_IMG] },
      );
      expect(h.images.remove).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_SOURCE_IMG));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('connection reset'));
    });

    it('IMG-7 a failed "shown" query is logged and leaves the object and the versions alone', async () => {
      const warn = quietWarn();
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h, new Error('statement timeout'));

      await expect(h.service.removeImage(ME, RELEASE_COPY_ID, 0)).resolves.toBeDefined();
      expect(sweptPaths(h)).toEqual([]);
      expect(h.images.remove).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_SOURCE_IMG));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('statement timeout'));
    });

    it('IMG-7 a failed sweep during a release is logged and deletes no object', async () => {
      const warn = quietWarn();
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      h.dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT EXISTS')) return [{ shown: false }];
        throw new Error('deadlock detected');
      });

      await expect(h.service.removeImage(ME, RELEASE_COPY_ID, 0)).resolves.toBeDefined();
      expect(h.images.remove).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('deadlock detected'));
    });

    it('IMG-7 a bucket delete that fails during a release is logged and the request succeeds', async () => {
      const warn = quietWarn();
      const h = harness();
      routeFindOne(h, {
        load: copyRecipe(),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);
      h.images.remove.mockRejectedValue(new Error('bucket unavailable'));

      await expect(h.service.removeImage(ME, RELEASE_COPY_ID, 0)).resolves.toBeDefined();
      expect(sweptPaths(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_SOURCE_IMG));
    });
  });

  describe('after a sync', () => {
    const SOURCE_VERSION = versionRow({
      id: 'source-version-3',
      recipeId: RELEASE_SOURCE_ID,
      versionNumber: 3,
      imagePaths: [RELEASE_SOURCE_IMG],
    });

    function syncRoute(
      h: Harness,
      previous: string[],
      owners: Record<string, OwnerRow>,
    ): void {
      routeFindOne(h, {
        load: copyRecipe(previous),
        source: recipeRow({
          id: RELEASE_SOURCE_ID,
          ownerId: OWNER,
          visibility: 'public',
          currentVersionId: SOURCE_VERSION.id,
          currentVersion: SOURCE_VERSION,
        }),
        owners,
      });
      h.manager.findOne.mockResolvedValue(versionRow({ versionNumber: 2 }));
    }

    it('IMG-7 offers only the paths the sync left out of the copy current version', async () => {
      const h = harness();
      syncRoute(h, [RELEASE_GRAND_IMG, RELEASE_SOURCE_IMG, RELEASE_COPY_IMG], {
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
        [RELEASE_COPY_ID]: LIVE(RELEASE_COPY_ID),
      });
      routeQueries(h);

      await h.service.sync(ME, RELEASE_COPY_ID);

      expect(ownerLookups(h)).toEqual([RELEASE_GRAND_ID, RELEASE_COPY_ID]);
      expect(existsChecks(h)).toEqual([RELEASE_GRAND_IMG]);
      expect(sweptPaths(h)).toEqual([RELEASE_GRAND_IMG]);
      expect(h.images.remove).toHaveBeenCalledTimes(1);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_GRAND_IMG);
    });

    it('IMG-7 runs the check after the sync transaction wrote the new version', async () => {
      const h = harness();
      syncRoute(h, [RELEASE_GRAND_IMG], {
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
      });
      routeQueries(h);

      await h.service.sync(ME, RELEASE_COPY_ID);

      expect(h.manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: RELEASE_COPY_ID },
        { currentVersionId: 'generated-1', syncedVersionNumber: 3 },
      );
      expect(h.manager.update.mock.invocationCallOrder[0]).toBeLessThan(
        h.dataSource.query.mock.invocationCallOrder[0],
      );
    });

    it('IMG-7 keeps a dropped path that another live recipe current version still shows', async () => {
      const h = harness();
      syncRoute(h, [RELEASE_GRAND_IMG], {
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
      });
      routeQueries(h, { [RELEASE_GRAND_IMG]: true });

      await h.service.sync(ME, RELEASE_COPY_ID);

      expect(sweptPaths(h)).toEqual([]);
      expect(h.images.remove).not.toHaveBeenCalled();
    });

    it('IMG-7 checks nothing when the sync keeps every path', async () => {
      const h = harness();
      syncRoute(h, [RELEASE_SOURCE_IMG], {});
      routeQueries(h);

      await h.service.sync(ME, RELEASE_COPY_ID);

      expect(ownerLookups(h)).toEqual([]);
      expect(h.dataSource.query).not.toHaveBeenCalled();
    });

    it('IMG-7 a failed check after a sync is logged and the sync still returns the detail', async () => {
      const warn = quietWarn();
      const h = harness();
      syncRoute(h, [RELEASE_GRAND_IMG], {
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
      });
      routeQueries(h, new Error('statement timeout'));

      await expect(h.service.sync(ME, RELEASE_COPY_ID)).resolves.toBe(DETAIL);
      expect(h.images.remove).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_GRAND_IMG));
    });
  });

  describe('after removing a saved copy', () => {
    function removeCopyRoute(h: Harness, owners: Record<string, OwnerRow>): void {
      routeFindOne(h, { load: copyRecipe(), owners });
      h.versions.find.mockResolvedValue([
        versionRow({
          id: 'copy-version-1',
          recipeId: RELEASE_COPY_ID,
          imagePaths: [RELEASE_GRAND_IMG, RELEASE_SOURCE_IMG],
        }),
        versionRow({
          id: 'copy-version-2',
          recipeId: RELEASE_COPY_ID,
          versionNumber: 2,
          imagePaths: [RELEASE_SOURCE_IMG, RELEASE_COPY_IMG],
        }),
      ]);
    }

    it('IMG-7 releases the linked images of deleted owners that the copy was the last live recipe to show', async () => {
      const h = harness();
      removeCopyRoute(h, {
        [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID),
        [RELEASE_GRAND_ID]: null,
      });
      routeQueries(h);

      await h.service.remove(ME, RELEASE_COPY_ID);

      expect(existsChecks(h)).toEqual([RELEASE_GRAND_IMG, RELEASE_SOURCE_IMG]);
      expect(sweptPaths(h)).toEqual([RELEASE_GRAND_IMG, RELEASE_SOURCE_IMG]);
      expect(h.images.remove).toHaveBeenCalledTimes(3);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_COPY_IMG);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_GRAND_IMG);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_SOURCE_IMG);
    });

    it('IMG-7 offers only the linked paths: the copy own objects are deleted without a check', async () => {
      const h = harness();
      removeCopyRoute(h, {
        [RELEASE_SOURCE_ID]: LIVE(RELEASE_SOURCE_ID),
        [RELEASE_GRAND_ID]: LIVE(RELEASE_GRAND_ID),
      });
      routeQueries(h);

      await h.service.remove(ME, RELEASE_COPY_ID);

      expect(ownerLookups(h)).toEqual([RELEASE_GRAND_ID, RELEASE_SOURCE_ID]);
      expect(h.images.remove).toHaveBeenCalledTimes(1);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_COPY_IMG);
      expect(sweptPaths(h)).toEqual([]);
    });

    it('IMG-7 runs the check after the copy row is hard-deleted', async () => {
      const h = harness();
      removeCopyRoute(h, {
        [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID),
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
      });
      routeQueries(h);

      await h.service.remove(ME, RELEASE_COPY_ID);

      expect(h.manager.delete.mock.invocationCallOrder[0]).toBeLessThan(
        h.dataSource.query.mock.invocationCallOrder[0],
      );
    });

    it('IMG-7 keeps a linked image of a deleted owner that another live copy still shows', async () => {
      const h = harness();
      removeCopyRoute(h, {
        [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID),
        [RELEASE_GRAND_ID]: SOFT_DELETED(RELEASE_GRAND_ID),
      });
      routeQueries(h, { [RELEASE_SOURCE_IMG]: true });

      await h.service.remove(ME, RELEASE_COPY_ID);

      expect(sweptPaths(h)).toEqual([RELEASE_GRAND_IMG]);
      expect(h.images.remove).not.toHaveBeenCalledWith(RELEASE_SOURCE_IMG);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_GRAND_IMG);
    });

    it('IMG-7 a failed check after removing a copy is logged and the removal still succeeds', async () => {
      const warn = quietWarn();
      const h = harness();
      removeCopyRoute(h, {});
      h.recipes.findOne.mockImplementation(async (options: { select?: unknown }) => {
        if (options.select !== undefined) throw new Error('connection reset');
        return copyRecipe();
      });

      await expect(h.service.remove(ME, RELEASE_COPY_ID)).resolves.toBeUndefined();
      expect(h.manager.delete).toHaveBeenCalledWith(RecipeEntity, { id: RELEASE_COPY_ID });
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_COPY_IMG);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_GRAND_IMG));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_SOURCE_IMG));
    });
  });

  describe('after soft-deleting a recipe or fork', () => {
    function ownRecipe(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
      return recipeRow({
        id: RELEASE_OWN_ID,
        ownerId: ME,
        currentVersionId: 'own-version-2',
        currentVersion: versionRow({
          id: 'own-version-2',
          recipeId: RELEASE_OWN_ID,
          versionNumber: 2,
          imagePaths: [RELEASE_OWN_IMG],
        }),
        ...overrides,
      });
    }

    it('IMG-7 a soft-deleted recipe that no live copy shows loses its objects at once', async () => {
      const h = harness();
      routeFindOne(h, {
        load: ownRecipe(),
        owners: { [RELEASE_OWN_ID]: SOFT_DELETED(RELEASE_OWN_ID) },
      });
      routeQueries(h);
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [RELEASE_OWN_IMG] }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      expect(h.recipes.update).toHaveBeenCalledWith(
        { id: RELEASE_OWN_ID },
        { deletedAt: expect.any(Date) },
      );
      expect(existsChecks(h)).toEqual([RELEASE_OWN_IMG]);
      expect(sweptPaths(h)).toEqual([RELEASE_OWN_IMG]);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_OWN_IMG);
    });

    it('IMG-7 soft-deletes first, then checks, sweeps and deletes the object', async () => {
      const h = harness();
      routeFindOne(h, {
        load: ownRecipe(),
        owners: { [RELEASE_OWN_ID]: SOFT_DELETED(RELEASE_OWN_ID) },
      });
      routeQueries(h);
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [RELEASE_OWN_IMG] }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      const [checkOrder, sweepOrder] = h.dataSource.query.mock.invocationCallOrder;
      expect(h.recipes.update.mock.invocationCallOrder[0]).toBeLessThan(checkOrder);
      expect(checkOrder).toBeLessThan(sweepOrder);
      expect(sweepOrder).toBeLessThan(h.images.remove.mock.invocationCallOrder[0]);
    });

    it('IMG-7 offers every path of every version of the soft-deleted recipe, each once', async () => {
      const h = harness();
      const pastImg = `recipes/${RELEASE_OWN_ID}/6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d.png`;
      routeFindOne(h, {
        load: ownRecipe(),
        owners: { [RELEASE_OWN_ID]: SOFT_DELETED(RELEASE_OWN_ID) },
      });
      routeQueries(h);
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [pastImg, RELEASE_OWN_IMG] }),
        versionRow({
          recipeId: RELEASE_OWN_ID,
          versionNumber: 2,
          imagePaths: [RELEASE_OWN_IMG],
        }),
        versionRow({
          recipeId: RELEASE_OWN_ID,
          versionNumber: 3,
          imagePaths: null as unknown as string[],
        }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      expect(h.versions.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipeId: RELEASE_OWN_ID } }),
      );
      expect(existsChecks(h)).toEqual([pastImg, RELEASE_OWN_IMG]);
      expect(h.images.remove).toHaveBeenCalledTimes(2);
    });

    it('IMG-7 a soft-deleted fork keeps the source images it linked while the source is live', async () => {
      const h = harness();
      routeFindOne(h, {
        load: ownRecipe({
          savedFromRecipeId: RELEASE_SOURCE_ID,
          forkedFromRecipeId: RELEASE_SOURCE_ID,
          forkedAt: AT,
        }),
        owners: {
          [RELEASE_OWN_ID]: SOFT_DELETED(RELEASE_OWN_ID),
          [RELEASE_SOURCE_ID]: LIVE(RELEASE_SOURCE_ID),
        },
      });
      routeQueries(h);
      h.versions.find.mockResolvedValue([
        versionRow({
          recipeId: RELEASE_OWN_ID,
          imagePaths: [RELEASE_SOURCE_IMG, RELEASE_OWN_IMG],
        }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      expect(h.recipes.update).toHaveBeenCalledWith(
        { id: RELEASE_OWN_ID },
        { deletedAt: expect.any(Date) },
      );
      expect(h.manager.delete).not.toHaveBeenCalled();
      expect(existsChecks(h)).toEqual([RELEASE_OWN_IMG]);
      expect(h.images.remove).toHaveBeenCalledTimes(1);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_OWN_IMG);
    });

    it('IMG-7 a soft-deleted fork releases a linked image of a deleted source that nothing else shows', async () => {
      const h = harness();
      routeFindOne(h, {
        load: ownRecipe({
          savedFromRecipeId: RELEASE_SOURCE_ID,
          forkedFromRecipeId: RELEASE_SOURCE_ID,
          forkedAt: AT,
          currentVersion: versionRow({
            recipeId: RELEASE_OWN_ID,
            imagePaths: [RELEASE_SOURCE_IMG],
          }),
        }),
        owners: { [RELEASE_SOURCE_ID]: SOFT_DELETED(RELEASE_SOURCE_ID) },
      });
      routeQueries(h);
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [RELEASE_SOURCE_IMG] }),
      ]);

      await h.service.remove(ME, RELEASE_OWN_ID);

      expect(sweptPaths(h)).toEqual([RELEASE_SOURCE_IMG]);
      expect(h.images.remove).toHaveBeenCalledWith(RELEASE_SOURCE_IMG);
    });

    it('IMG-7 a failed check after a soft delete is logged and the soft delete stands', async () => {
      const warn = quietWarn();
      const h = harness();
      routeFindOne(h, {
        load: ownRecipe(),
        owners: { [RELEASE_OWN_ID]: SOFT_DELETED(RELEASE_OWN_ID) },
      });
      routeQueries(h, new Error('statement timeout'));
      h.versions.find.mockResolvedValue([
        versionRow({ recipeId: RELEASE_OWN_ID, imagePaths: [RELEASE_OWN_IMG] }),
      ]);

      await expect(h.service.remove(ME, RELEASE_OWN_ID)).resolves.toBeUndefined();
      expect(h.recipes.update).toHaveBeenCalledWith(
        { id: RELEASE_OWN_ID },
        { deletedAt: expect.any(Date) },
      );
      expect(h.images.remove).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(RELEASE_OWN_IMG));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('statement timeout'));
    });

    it('IMG-7, REC-6 checks nothing when someone other than the owner tries to remove the recipe', async () => {
      const h = harness();
      routeFindOne(h, { load: ownRecipe({ ownerId: OWNER }) });
      routeQueries(h);

      await expect(h.service.remove(ME, RELEASE_OWN_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(ownerLookups(h)).toEqual([]);
      expect(h.dataSource.query).not.toHaveBeenCalled();
      expect(h.images.remove).not.toHaveBeenCalled();
    });
  });
});

// §3: REC-1/6/7/8, SAVE-1/4..10, CAT-3/4/7, IMG-6 and §3.1.1 validation on every recipe write.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
import { MAX_IMAGES_PER_RECIPE } from '@rsn/shared/util-domain';
import type {
  Category,
  RecipeContent,
  RecipeSource,
  Visibility,
} from '@rsn/shared/util-domain';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
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
  dataSource: { transaction: jest.Mock };
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

    it('REC-1 returns the detail of the new recipe', async () => {
      const { service, recipes, dtos } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({ ownerId: ME, currentVersion: versionRow() }),
      );

      await expect(service.create(ME, content())).resolves.toBe(DETAIL);
      expect(dtos.toDetail).toHaveBeenCalled();
    });

    it.each([
      ['a blank title', { title: '  ' }, 'title is required'],
      [
        'a title over 200 characters',
        { title: 'x'.repeat(201) },
        'title is longer than 200 characters',
      ],
      [
        'a description over 500 characters',
        { description: 'x'.repeat(501) },
        'description is longer than 500 characters',
      ],
      [
        'a category outside the 14',
        { category: 'Tacos' as Category },
        'category must be one of the 14 categories',
      ],
      ['zero servings', { servings: 0 }, 'servings must be an integer >= 1'],
      ['no ingredient', { ingredients: [] }, 'at least one ingredient is required'],
      ['no step', { steps: [] }, 'at least one step is required'],
      [
        'a unit outside the fixed list',
        {
          ingredients: [
            { quantity: 1, unit: 'handful' as never, name: 'egg' },
          ],
        },
        'ingredient 1: unit is not in the fixed list',
      ],
      [
        'a blank step',
        { steps: [{ text: '  ' }] },
        'step 1: text is required',
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
      expect(error.message).toBe(
        'A recipe can only be shared with friends: stranger-1',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
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
  });
});

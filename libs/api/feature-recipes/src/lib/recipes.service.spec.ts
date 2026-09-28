// §3: REC-1/6/7/8, SAVE-1/4/5/6, IMG-6 and §3.1.1 validation on every recipe write.
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
} from '@rsn/api/data-access-db';
import type { ImageStorageService } from '@rsn/api/data-access-images';
import type { TheMealDbService } from '@rsn/api/data-access-themealdb';
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
    source: 'user' as RecipeSource,
    externalId: null,
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

    it('SAVE-5, SAVE-6 records the fork on the first edit of a saved copy', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: null,
          currentVersion: versionRow(),
        }),
      );
      manager.findOne.mockResolvedValue(versionRow({ versionNumber: 1 }));

      await service.update(ME, 'recipe-1', content({ title: 'My shakshuka' }));

      expect(manager.update).toHaveBeenCalledWith(
        RecipeEntity,
        { id: 'recipe-1' },
        { currentVersionId: 'generated-1', forkedFromRecipeId: 'source-1' },
      );
    });

    it('SAVE-6 leaves an existing fork attribution untouched on later edits', async () => {
      const { service, recipes, manager } = harness();
      recipes.findOne.mockResolvedValue(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
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
          externalId: '52772',
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

  describe('REC-6, SAVE-4 remove', () => {
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
  });
});

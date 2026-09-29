// REC-4, REC-6, REC-8, SAVE-2, COOK-5: who may view, cook and change a recipe.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { In } from 'typeorm';
import type { RecipeEntity, RecipeShareEntity } from '@rsn/api/data-access-db';
import type { Visibility } from '@rsn/shared/util-domain';
import { RecipeAccessService, relationOf } from './recipe-access.service';

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
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const ME = 'user-me';
const OWNER = 'user-owner';
const AT = new Date('2026-09-28T10:00:00.000Z');

function recipeRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
  return {
    id: 'recipe-1',
    ownerId: OWNER,
    visibility: 'private' as Visibility,
    currentVersionId: 'version-1',
    savedFromRecipeId: null,
    forkedFromRecipeId: null,
    source: 'user',
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

interface Harness {
  service: RecipeAccessService;
  recipes: { findOne: jest.Mock };
  shares: { exists: jest.Mock; find: jest.Mock };
}

function harness(): Harness {
  const recipes = { findOne: jest.fn().mockResolvedValue(null) };
  const shares = {
    exists: jest.fn().mockResolvedValue(false),
    find: jest.fn().mockResolvedValue([]),
  };
  return {
    service: new RecipeAccessService(
      recipes as unknown as Repository<RecipeEntity>,
      shares as unknown as Repository<RecipeShareEntity>,
    ),
    recipes,
    shares,
  };
}

describe('§11.6 relationOf', () => {
  it('§11.6 calls a recipe the caller owns and never saved "own"', () => {
    expect(relationOf(ME, recipeRow({ ownerId: ME }), false)).toBe('own');
  });

  it('SAVE-4 calls a recipe the caller owns through a save "saved"', () => {
    expect(
      relationOf(ME, recipeRow({ ownerId: ME, savedFromRecipeId: 'source' }), false),
    ).toBe('saved');
  });

  it('REC-8 calls someone else’s recipe shared with the caller "shared"', () => {
    expect(relationOf(ME, recipeRow({ visibility: 'shared' }), true)).toBe(
      'shared',
    );
  });

  it('REC-3 calls someone else’s published recipe "public"', () => {
    expect(relationOf(ME, recipeRow({ visibility: 'public' }), false)).toBe(
      'public',
    );
  });

  it('REC-1 calls someone else’s private recipe "none"', () => {
    expect(relationOf(ME, recipeRow({ visibility: 'private' }), false)).toBe(
      'none',
    );
  });

  it('REC-8 prefers "shared" over "public" when both hold', () => {
    expect(relationOf(ME, recipeRow({ visibility: 'public' }), true)).toBe(
      'shared',
    );
  });

  it('REC-6 keeps "own" for the owner whatever the share table says', () => {
    expect(
      relationOf(ME, recipeRow({ ownerId: ME, visibility: 'public' }), true),
    ).toBe('own');
  });
});

describe('RecipeAccessService', () => {
  describe('§12.1 loadOrThrow', () => {
    it('REC-4 loads the recipe with its current version', async () => {
      const { service, recipes } = harness();
      const recipe = recipeRow();
      recipes.findOne.mockResolvedValue(recipe);

      await expect(service.loadOrThrow('recipe-1')).resolves.toBe(recipe);

      expect(recipes.findOne).toHaveBeenCalledWith({
        where: { id: 'recipe-1' },
        relations: { currentVersion: true },
      });
    });

    it('§12.1 answers 404 for an unknown recipe', async () => {
      const { service } = harness();

      await expect(service.loadOrThrow('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('§12.1 answers 404 for a soft-deleted recipe, even for its owner', async () => {
      const { service, recipes } = harness();
      recipes.findOne.mockResolvedValue(recipeRow({ ownerId: ME, deletedAt: AT }));

      await expect(service.loadOrThrow('recipe-1')).rejects.toThrow(
        'Recipe not found',
      );
    });
  });

  describe('SAVE-2, COOK-5 canCook', () => {
    it('SAVE-2 lets the owner cook their own recipe', async () => {
      const { service, shares } = harness();

      await expect(
        service.canCook(ME, recipeRow({ ownerId: ME })),
      ).resolves.toBe(true);
      // The owner is decided without a share query.
      expect(shares.exists).not.toHaveBeenCalled();
    });

    it('SAVE-2 lets the caller cook a recipe they saved', async () => {
      const { service } = harness();

      await expect(
        service.canCook(
          ME,
          recipeRow({ ownerId: ME, savedFromRecipeId: 'source' }),
        ),
      ).resolves.toBe(true);
    });

    it('COOK-5, REC-8 lets the caller cook a recipe shared with them', async () => {
      const { service, shares } = harness();
      shares.exists.mockResolvedValue(true);

      await expect(
        service.canCook(ME, recipeRow({ visibility: 'shared' })),
      ).resolves.toBe(true);

      expect(shares.exists).toHaveBeenCalledWith({
        where: { recipeId: 'recipe-1', userId: ME },
      });
    });

    it('SAVE-2 refuses cook mode on a public recipe the caller has not saved', async () => {
      const { service } = harness();

      await expect(
        service.canCook(ME, recipeRow({ visibility: 'public' })),
      ).resolves.toBe(false);
    });

    it('SAVE-2 refuses cook mode on a private recipe of someone else', async () => {
      const { service } = harness();

      await expect(service.canCook(ME, recipeRow())).resolves.toBe(false);
    });

    it('SAVE-2 answers 403 with "Save this recipe before cooking it"', async () => {
      const { service } = harness();

      await expect(
        service.assertCanCook(ME, recipeRow({ visibility: 'public' })),
      ).rejects.toThrow('Save this recipe before cooking it');
    });
  });

  describe('REC-4, REC-8 canView', () => {
    it('REC-4 lets anyone view a public recipe', async () => {
      const { service } = harness();

      await expect(
        service.canView(ME, recipeRow({ visibility: 'public' })),
      ).resolves.toBe(true);
    });

    it('REC-1 hides a private recipe of someone else and answers 403', async () => {
      const { service } = harness();

      await expect(service.canView(ME, recipeRow())).resolves.toBe(false);
      await expect(service.assertCanView(ME, recipeRow())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('REC-6 ownership', () => {
    it('REC-6 recognises the owner and answers 403 for everyone else', () => {
      const { service } = harness();

      expect(service.isOwner(ME, recipeRow({ ownerId: ME }))).toBe(true);
      expect(service.isOwner(ME, recipeRow())).toBe(false);
      expect(() => service.assertIsOwner(ME, recipeRow())).toThrow(
        'Only the owner can change this recipe',
      );
    });

    it('SAVE-4 treats a saved copy as owned by the caller', () => {
      const { service } = harness();

      expect(() =>
        service.assertIsOwner(
          ME,
          recipeRow({ ownerId: ME, savedFromRecipeId: 'source' }),
        ),
      ).not.toThrow();
    });
  });

  describe('REC-8 sharedRecipeIds', () => {
    it('REC-8 asks for the caller’s shares of the given recipes only', async () => {
      const { service, shares } = harness();
      shares.find.mockResolvedValue([{ recipeId: 'recipe-2' }]);

      const result = await service.sharedRecipeIds(ME, ['recipe-1', 'recipe-2']);

      expect(shares.find).toHaveBeenCalledWith({
        where: { userId: ME, recipeId: In(['recipe-1', 'recipe-2']) },
        select: { recipeId: true },
      });
      expect(result).toEqual(new Set(['recipe-2']));
    });

    it('REC-8 skips the query for an empty list', async () => {
      const { service, shares } = harness();

      await expect(service.sharedRecipeIds(ME, [])).resolves.toEqual(new Set());

      expect(shares.find).not.toHaveBeenCalled();
    });
  });
});

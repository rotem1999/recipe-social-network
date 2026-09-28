// §11.6 response bodies: RATE-2/4, COM-1/2, CAT-6, SAVE-2/6, REC-6/7 on RecipeDetailDto.
import type { Repository } from 'typeorm';
import type {
  RatingEntity,
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
  UserEntity,
} from '@rsn/api/data-access-db';
import type { ImageStorageService } from '@rsn/api/data-access-images';
import { THEMEALDB_ATTRIBUTION } from '@rsn/api/data-access-themealdb';
import type {
  Category,
  RecipeRelation,
  RecipeSource,
  Visibility,
} from '@rsn/shared/util-domain';
import type { RecipeAccessService } from './recipe-access.service';
import { RecipeDtoService } from './recipe-dto.service';

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

interface Harness {
  service: RecipeDtoService;
  recipes: { find: jest.Mock; findOne: jest.Mock };
  versions: { count: jest.Mock; find: jest.Mock };
  shares: { find: jest.Mock };
  ratings: { findOne: jest.Mock; find: jest.Mock };
  users: { findOne: jest.Mock; find: jest.Mock };
  images: { signedUrls: jest.Mock };
  access: { relationFor: jest.Mock; isOwner: jest.Mock; sharedRecipeIds: jest.Mock };
}

function harness(relation: RecipeRelation, isOwner = false): Harness {
  const recipes = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const versions = { count: jest.fn().mockResolvedValue(1), find: jest.fn() };
  const shares = { find: jest.fn().mockResolvedValue([]) };
  const ratings = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn() };
  const users = {
    findOne: jest.fn().mockResolvedValue({ id: OWNER, username: 'owner' }),
    find: jest.fn().mockResolvedValue([]),
  };
  const images = { signedUrls: jest.fn().mockResolvedValue([]) };
  const access = {
    relationFor: jest.fn().mockResolvedValue(relation),
    isOwner: jest.fn().mockReturnValue(isOwner),
    sharedRecipeIds: jest.fn().mockResolvedValue(new Set<string>()),
  };

  const service = new RecipeDtoService(
    recipes as unknown as Repository<RecipeEntity>,
    versions as unknown as Repository<RecipeVersionEntity>,
    shares as unknown as Repository<RecipeShareEntity>,
    ratings as unknown as Repository<RatingEntity>,
    users as unknown as Repository<UserEntity>,
    images as unknown as ImageStorageService,
    access as unknown as RecipeAccessService,
  );
  return { service, recipes, versions, shares, ratings, users, images, access };
}

describe('RecipeDtoService.toDetail', () => {
  describe('CAT-6 attribution', () => {
    it('CAT-6 carries TheMealDB’s attribution string on a catalogue recipe', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME, source: 'themealdb', externalId: '52772' }),
        versionRow(),
        ME,
      );

      expect(detail.attribution).toBe(THEMEALDB_ATTRIBUTION);
      expect(detail.attribution).toBe(
        'Recipe data and imagery: TheMealDB (https://www.themealdb.com/)',
      );
    });

    it('CAT-6 leaves the attribution null on a user recipe', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME, source: 'user' }),
        versionRow(),
        ME,
      );

      expect(detail.attribution).toBeNull();
    });

    it('CAT-6 leaves the attribution null on a public user recipe of someone else', async () => {
      const { service } = harness('public');

      const detail = await service.toDetail(
        recipeRow({ visibility: 'public' }),
        versionRow(),
        ME,
      );

      expect(detail.attribution).toBeNull();
    });
  });

  describe('RATE-2, RATE-4 rating', () => {
    it('RATE-2 carries the average, the count and the caller’s own grade on a public recipe', async () => {
      const { service, ratings } = harness('public');
      ratings.findOne.mockResolvedValue({ stars: 4 });

      const detail = await service.toDetail(
        recipeRow({ visibility: 'public', ratingAverage: 4.25, ratingCount: 12 }),
        versionRow(),
        ME,
      );

      expect(detail.rating).toEqual({ average: 4.25, count: 12, mine: 4 });
      expect(ratings.findOne).toHaveBeenCalledWith({
        where: { recipeId: 'recipe-1', userId: ME },
      });
    });

    it('RATE-4 reports mine as null when the caller has not graded a public recipe', async () => {
      const { service } = harness('public');

      const detail = await service.toDetail(
        recipeRow({ visibility: 'public', ratingCount: 0 }),
        versionRow(),
        ME,
      );

      expect(detail.rating).toEqual({ average: null, count: 0, mine: null });
    });

    it.each(['private', 'shared'] as const)(
      'RATE-2 leaves the rating null on a %s recipe and asks for no grade',
      async (visibility) => {
        const { service, ratings } = harness(
          visibility === 'shared' ? 'shared' : 'own',
          visibility === 'private',
        );

        const detail = await service.toDetail(
          recipeRow({ ownerId: ME, visibility }),
          versionRow(),
          ME,
        );

        expect(detail.rating).toBeNull();
        expect(ratings.findOne).not.toHaveBeenCalled();
      },
    );
  });

  describe('RATE-1, COM-1, COM-2 canRate, hasVotes and hasComments', () => {
    it('RATE-1, COM-1, COM-2 turns grades, votes and comments on for a public recipe', async () => {
      const { service } = harness('public');

      const detail = await service.toDetail(
        recipeRow({ visibility: 'public' }),
        versionRow(),
        ME,
      );

      expect(detail.canRate).toBe(true);
      expect(detail.hasVotes).toBe(true);
      expect(detail.hasComments).toBe(true);
    });

    it('COM-1, COM-2 gives a shared recipe comments but no grades and no votes', async () => {
      const { service } = harness('shared');

      const detail = await service.toDetail(
        recipeRow({ visibility: 'shared' }),
        versionRow(),
        ME,
      );

      expect(detail.canRate).toBe(false);
      expect(detail.hasVotes).toBe(false);
      expect(detail.hasComments).toBe(true);
    });

    it('RATE-1, COM-1 gives a private recipe no grades, no votes and no comments', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME, visibility: 'private' }),
        versionRow(),
        ME,
      );

      expect(detail.canRate).toBe(false);
      expect(detail.hasVotes).toBe(false);
      expect(detail.hasComments).toBe(false);
    });
  });

  describe('SAVE-2, COOK-5, REC-6 flags', () => {
    it.each([
      ['own', true],
      ['saved', true],
      ['shared', true],
      ['public', false],
      ['none', false],
    ] as [RecipeRelation, boolean][])(
      'SAVE-2, COOK-5 sets canCook to %s -> %s',
      async (relation, expected) => {
        const { service } = harness(relation);

        const detail = await service.toDetail(
          recipeRow({ visibility: 'public' }),
          versionRow(),
          ME,
        );

        expect(detail.relation).toBe(relation);
        expect(detail.canCook).toBe(expected);
      },
    );

    it('REC-6 sets canEdit for the owner only, and lists the shares to the owner only', async () => {
      const ownerView = harness('own', true);
      ownerView.shares.find.mockResolvedValue([{ userId: 'friend-1' }]);
      const otherView = harness('shared', false);

      const mine = await ownerView.service.toDetail(
        recipeRow({ ownerId: ME, visibility: 'shared' }),
        versionRow(),
        ME,
      );
      const theirs = await otherView.service.toDetail(
        recipeRow({ visibility: 'shared' }),
        versionRow(),
        ME,
      );

      expect(mine.canEdit).toBe(true);
      expect(mine.sharedWithUserIds).toEqual(['friend-1']);
      expect(theirs.canEdit).toBe(false);
      expect(theirs.sharedWithUserIds).toEqual([]);
      expect(otherView.shares.find).not.toHaveBeenCalled();
    });
  });

  describe('REC-7, SAVE-6 versions and attribution to the source recipe', () => {
    it('REC-7 reports how many versions the recipe has', async () => {
      const { service, versions } = harness('own', true);
      versions.count.mockResolvedValue(3);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME }),
        versionRow({ versionNumber: 3 }),
        ME,
      );

      expect(detail.versionCount).toBe(3);
      expect(detail.versionNumber).toBe(3);
      expect(versions.count).toHaveBeenCalledWith({
        where: { recipeId: 'recipe-1' },
      });
    });

    it('SAVE-6 names the recipe a fork came from and the one a copy was saved from', async () => {
      const { service, recipes } = harness('saved');
      recipes.findOne.mockResolvedValue(
        recipeRow({
          id: 'source-1',
          currentVersion: versionRow({ title: 'Original shakshuka' }),
          owner: { id: OWNER, username: 'owner' } as UserEntity,
        }),
      );

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
        }),
        versionRow(),
        ME,
      );

      expect(detail.forkedFrom).toEqual({
        recipeId: 'source-1',
        title: 'Original shakshuka',
        ownerUsername: 'owner',
      });
      expect(detail.savedFrom).toEqual(detail.forkedFrom);
    });

    it('SAVE-6 leaves both attributions null on a recipe written from scratch', async () => {
      const { service, recipes } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME }),
        versionRow(),
        ME,
      );

      expect(detail.forkedFrom).toBeNull();
      expect(detail.savedFrom).toBeNull();
      expect(recipes.findOne).not.toHaveBeenCalled();
    });
  });

  describe('§3.1.1, IMG-4 content and images', () => {
    it('§3.1.1 copies the version content onto the detail and omits an absent description', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME }),
        versionRow({ prepMinutes: 10, cookMinutes: 20 }),
        ME,
      );

      expect(detail.title).toBe('Shakshuka');
      expect(detail.category).toBe('Breakfast');
      expect(detail.servings).toBe(2);
      expect(detail.prepMinutes).toBe(10);
      expect(detail.cookMinutes).toBe(20);
      expect(detail.ingredients).toEqual([
        { quantity: 4, unit: 'piece', name: 'egg' },
      ]);
      expect(detail.steps).toEqual([{ text: 'Crack the eggs into the sauce.' }]);
      expect(detail).not.toHaveProperty('description');
      expect(detail.ownerUsername).toBe('owner');
      expect(detail.updatedAt).toBe(AT.toISOString());
    });

    it('IMG-4 returns one signed URL per stored path and uses the first as the card image', async () => {
      const { service, images } = harness('own', true);
      images.signedUrls.mockResolvedValue([
        'https://signed.example/one',
        'https://signed.example/two',
      ]);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME }),
        versionRow({ imagePaths: ['recipes/recipe-1/a.jpg', 'recipes/recipe-1/b.jpg'] }),
        ME,
      );

      expect(images.signedUrls).toHaveBeenCalledWith([
        'recipes/recipe-1/a.jpg',
        'recipes/recipe-1/b.jpg',
      ]);
      expect(detail.imageUrls).toEqual([
        'https://signed.example/one',
        'https://signed.example/two',
      ]);
      expect(detail.imageUrl).toBe('https://signed.example/one');
    });

    it('IMG-6 returns no image URLs when Firebase is unconfigured, and falls back to TheMealDB’s own image', async () => {
      const { service, images } = harness('own', true);
      images.signedUrls.mockResolvedValue([]);

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
        }),
        versionRow({ imagePaths: ['recipes/recipe-1/a.jpg'] }),
        ME,
      );

      expect(detail.imageUrls).toEqual([]);
      expect(detail.imageUrl).toBe(
        'https://www.themealdb.com/images/media/meals/x.jpg',
      );
    });
  });
});

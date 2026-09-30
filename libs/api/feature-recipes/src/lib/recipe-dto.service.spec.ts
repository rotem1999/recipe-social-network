// §11.6 response bodies: RATE-2/4, COM-1/2, CAT-6, SAVE-2/6/7/9/10, DISC-10, REC-6/7.
import { In, IsNull, Not } from 'typeorm';
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
  const versions = {
    count: jest.fn().mockResolvedValue(1),
    find: jest.fn().mockResolvedValue([]),
  };
  const shares = { find: jest.fn().mockResolvedValue([]) };
  const ratings = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
  };
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

    it('SAVE-6, SAVE-9 names the recipe a fork came from as forkedFrom only, never both lines', async () => {
      const { service, recipes, access } = harness('own', true);
      access.relationFor.mockImplementation(
        async (_userId: string, recipe: RecipeEntity) =>
          recipe.id === 'source-1' ? 'public' : 'own',
      );
      recipes.findOne.mockResolvedValue(
        recipeRow({
          id: 'source-1',
          visibility: 'public',
          currentVersion: versionRow({ title: 'Original shakshuka' }),
          owner: { id: OWNER, username: 'owner' } as UserEntity,
        }),
      );

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          forkedFromRecipeId: 'source-1',
          forkedAt: AT,
        }),
        versionRow(),
        ME,
      );

      expect(detail.forkedFrom).toEqual({
        recipeId: 'source-1',
        title: 'Original shakshuka',
        ownerUsername: 'owner',
        source: 'user',
      });
      expect(detail.savedFrom).toBeNull();
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

  describe('CAT-6, UI-20 externalImageUrl', () => {
    it('UI-20 carries a TheMealDB copy’s strMealThumb as externalImageUrl', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
        }),
        versionRow(),
        ME,
      );

      expect(detail.externalImageUrl).toBe(
        'https://www.themealdb.com/images/media/meals/x.jpg',
      );
      expect(detail.imageUrls).toEqual([]);
    });

    it('IMG-7, UI-20 keeps externalImageUrl apart from the uploaded imageUrls', async () => {
      const { service, images } = harness('own', true);
      images.signedUrls.mockResolvedValue(['https://signed.example/one']);

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          source: 'themealdb',
          externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
        }),
        versionRow({ imagePaths: ['recipes/recipe-1/a.jpg'] }),
        ME,
      );

      expect(detail.imageUrls).toEqual(['https://signed.example/one']);
      expect(detail.imageUrls).not.toContain(
        'https://www.themealdb.com/images/media/meals/x.jpg',
      );
      expect(detail.externalImageUrl).toBe(
        'https://www.themealdb.com/images/media/meals/x.jpg',
      );
    });

    it('UI-20 carries the inherited externalImageUrl on a copy of a TheMealDB copy', async () => {
      const { service } = harness('saved');

      const detail = await service.toDetail(
        recipeRow({
          id: 'copy-1',
          ownerId: ME,
          savedFromRecipeId: 'source-1',
          source: 'user',
          externalImageUrl: 'https://www.themealdb.com/images/media/meals/x.jpg',
        }),
        versionRow({ recipeId: 'copy-1' }),
        ME,
      );

      expect(detail.externalImageUrl).toBe(
        'https://www.themealdb.com/images/media/meals/x.jpg',
      );
    });

    it('UI-20 sets externalImageUrl to null on a recipe without one', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({ ownerId: ME }),
        versionRow(),
        ME,
      );

      expect(detail.externalImageUrl).toBeNull();
    });

    it('UI-20 sets externalImageUrl to null when the row leaves it undefined', async () => {
      const { service } = harness('own', true);

      const detail = await service.toDetail(
        recipeRow({
          ownerId: ME,
          externalImageUrl: undefined as unknown as null,
        }),
        versionRow(),
        ME,
      );

      expect(detail).toHaveProperty('externalImageUrl', null);
    });
  });
});

/** The source of the copies below: someone else's public recipe, now at version 3. */
function sourceRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
  return recipeRow({
    id: 'source-1',
    ownerId: OWNER,
    visibility: 'public',
    currentVersionId: 'source-version-3',
    currentVersion: versionRow({
      id: 'source-version-3',
      recipeId: 'source-1',
      versionNumber: 3,
      title: 'Original shakshuka',
    }),
    owner: { id: OWNER, username: 'owner' } as UserEntity,
    ...overrides,
  });
}

/** The caller's copy of `source-1`. */
function copyRow(overrides: Partial<RecipeEntity> = {}): RecipeEntity {
  return recipeRow({
    id: 'copy-1',
    ownerId: ME,
    savedFromRecipeId: 'source-1',
    syncedVersionNumber: 3,
    currentVersion: versionRow({ id: 'copy-version', recipeId: 'copy-1' }),
    ...overrides,
  });
}

/** relationFor answers `copyRelation` for the copy and `sourceRelation` for its source. */
function withRelations(
  h: Harness,
  copyRelation: RecipeRelation,
  sourceRelation: RecipeRelation,
): void {
  h.access.relationFor.mockImplementation(
    async (_userId: string, recipe: RecipeEntity) =>
      recipe.id === 'source-1' ? sourceRelation : copyRelation,
  );
}

describe('RecipeDtoService.toDetail SAVE-9 attribution line', () => {
  it('SAVE-9 gives a saved copy of a user recipe savedFrom with the source’s current title and owner, linked while viewable', async () => {
    const h = harness('saved', true);
    withRelations(h, 'saved', 'public');
    h.recipes.findOne.mockResolvedValue(sourceRow());

    const detail = await h.service.toDetail(copyRow(), versionRow(), ME);

    expect(detail.savedFrom).toEqual({
      recipeId: 'source-1',
      title: 'Original shakshuka',
      ownerUsername: 'owner',
      source: 'user',
    });
    expect(detail.forkedFrom).toBeNull();
    expect(h.recipes.findOne).toHaveBeenCalledWith({
      where: { id: 'source-1' },
      relations: { currentVersion: true, owner: true },
    });
  });

  it('SAVE-9 links a source shared with the caller', async () => {
    const h = harness('saved', true);
    withRelations(h, 'saved', 'shared');
    h.recipes.findOne.mockResolvedValue(sourceRow({ visibility: 'shared' }));

    const detail = await h.service.toDetail(copyRow(), versionRow(), ME);

    expect(detail.savedFrom?.recipeId).toBe('source-1');
  });

  it('SAVE-9 keeps title and owner but drops the link when the source is soft-deleted', async () => {
    const h = harness('saved', true);
    withRelations(h, 'saved', 'public');
    h.recipes.findOne.mockResolvedValue(sourceRow({ deletedAt: AT }));

    const detail = await h.service.toDetail(copyRow(), versionRow(), ME);

    expect(detail.savedFrom).toEqual({
      recipeId: null,
      title: 'Original shakshuka',
      ownerUsername: 'owner',
      source: 'user',
    });
  });

  it('SAVE-9 drops the link when the caller can no longer view the source', async () => {
    const h = harness('own', true);
    withRelations(h, 'own', 'none');
    h.recipes.findOne.mockResolvedValue(sourceRow({ visibility: 'private' }));

    const detail = await h.service.toDetail(
      copyRow({ forkedAt: AT, forkedFromRecipeId: 'source-1' }),
      versionRow(),
      ME,
    );

    expect(detail.forkedFrom).toEqual({
      recipeId: null,
      title: 'Original shakshuka',
      ownerUsername: 'owner',
      source: 'user',
    });
    expect(detail.savedFrom).toBeNull();
  });

  it('SAVE-9, CAT-7 gives a saved TheMealDB copy "Saved from <strMeal> on TheMealDB" with no link, no owner and no lookup', async () => {
    const h = harness('saved', true);

    const detail = await h.service.toDetail(
      recipeRow({
        ownerId: ME,
        source: 'themealdb',
        externalId: '52772',
        externalTitle: 'Teriyaki Chicken Casserole',
      }),
      versionRow({ title: 'Renamed later' }),
      ME,
    );

    expect(detail.savedFrom).toEqual({
      recipeId: null,
      title: 'Teriyaki Chicken Casserole',
      ownerUsername: null,
      source: 'themealdb',
    });
    expect(detail.forkedFrom).toBeNull();
    expect(h.recipes.findOne).not.toHaveBeenCalled();
    // SAVE-9: the §3.3 attribution string still shows at the bottom.
    expect(detail.attribution).toBe(THEMEALDB_ATTRIBUTION);
  });

  it('SAVE-9, CAT-7 moves a TheMealDB fork’s line to forkedFrom', async () => {
    const h = harness('own', true);

    const detail = await h.service.toDetail(
      recipeRow({
        ownerId: ME,
        source: 'themealdb',
        externalId: '52772',
        externalTitle: 'Teriyaki Chicken Casserole',
        forkedAt: AT,
      }),
      versionRow(),
      ME,
    );

    expect(detail.forkedFrom).toEqual({
      recipeId: null,
      title: 'Teriyaki Chicken Casserole',
      ownerUsername: null,
      source: 'themealdb',
    });
    expect(detail.savedFrom).toBeNull();
  });

  it('SAVE-7 carries the relation the access service decides for a saved copy', async () => {
    const h = harness('saved', true);
    withRelations(h, 'saved', 'public');
    h.recipes.findOne.mockResolvedValue(sourceRow());

    const detail = await h.service.toDetail(copyRow(), versionRow(), ME);

    expect(detail.relation).toBe('saved');
    expect(detail.canCook).toBe(true);
    expect(detail.canEdit).toBe(true);
  });
});

describe('RecipeDtoService.toDetail SAVE-10 and DISC-10 copy state', () => {
  it('SAVE-10 flags the caller’s copy when the viewable source moved past the synced version', async () => {
    const h = harness('saved', true);
    withRelations(h, 'saved', 'public');
    h.recipes.find.mockResolvedValue([sourceRow()]);

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: 2 }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(true);
    expect(detail.myCopyId).toBeNull();
    expect(h.recipes.find).toHaveBeenCalledWith({
      where: { id: In(['source-1']), deletedAt: IsNull() },
      relations: { currentVersion: true },
    });
    expect(h.access.sharedRecipeIds).toHaveBeenCalledWith(ME, ['source-1']);
  });

  it('SAVE-10 flags a fork too', async () => {
    const h = harness('own', true);
    h.recipes.find.mockResolvedValue([sourceRow()]);

    const detail = await h.service.toDetail(
      copyRow({
        syncedVersionNumber: 2,
        forkedAt: AT,
        forkedFromRecipeId: 'source-1',
      }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(true);
  });

  it('SAVE-10 reports no update when the copy is at the source’s version', async () => {
    const h = harness('saved', true);
    h.recipes.find.mockResolvedValue([sourceRow()]);

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: 3 }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(false);
  });

  it('SAVE-10 reports no update when the source is deleted (the query finds no live source)', async () => {
    const h = harness('saved', true);
    h.recipes.find.mockResolvedValue([]);

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: 1 }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(false);
  });

  it('SAVE-10 reports no update when the caller can no longer view the source', async () => {
    const h = harness('saved', true);
    h.recipes.find.mockResolvedValue([sourceRow({ visibility: 'private' })]);

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: 1 }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(false);
  });

  it('SAVE-10 reports an update from a source shared with the caller', async () => {
    const h = harness('saved', true);
    h.recipes.find.mockResolvedValue([sourceRow({ visibility: 'shared' })]);
    h.access.sharedRecipeIds.mockResolvedValue(new Set(['source-1']));

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: 1 }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(true);
  });

  it('SAVE-10 never reports an update on a copy with no synced version', async () => {
    const h = harness('saved', true);
    h.recipes.find.mockResolvedValue([sourceRow()]);

    const detail = await h.service.toDetail(
      copyRow({ syncedVersionNumber: null }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(false);
  });

  it('SAVE-10, CAT-7 never checks a TheMealDB copy for updates', async () => {
    const h = harness('saved', true);

    const detail = await h.service.toDetail(
      recipeRow({ ownerId: ME, source: 'themealdb', externalId: '52772' }),
      versionRow(),
      ME,
    );

    expect(detail.updateAvailable).toBe(false);
    expect(detail.myCopyId).toBeNull();
    expect(h.recipes.find).not.toHaveBeenCalled();
  });

  it('DISC-10 gives someone else’s public recipe the id of the caller’s live copy', async () => {
    const h = harness('public');
    h.recipes.find.mockResolvedValue([
      { id: 'copy-1', savedFromRecipeId: 'source-1', syncedVersionNumber: 3 },
    ]);

    const detail = await h.service.toDetail(sourceRow(), versionRow(), ME);

    expect(detail.myCopyId).toBe('copy-1');
    expect(detail.updateAvailable).toBe(false);
    expect(h.recipes.find).toHaveBeenCalledWith({
      where: {
        ownerId: ME,
        savedFromRecipeId: In(['source-1']),
        deletedAt: IsNull(),
      },
      select: { id: true, savedFromRecipeId: true, syncedVersionNumber: true },
    });
  });

  it('DISC-10, SAVE-10 flags the original when the caller’s copy is behind it', async () => {
    const h = harness('public');
    h.recipes.find.mockResolvedValue([
      { id: 'copy-1', savedFromRecipeId: 'source-1', syncedVersionNumber: 2 },
    ]);

    const detail = await h.service.toDetail(sourceRow(), versionRow(), ME);

    expect(detail.myCopyId).toBe('copy-1');
    expect(detail.updateAvailable).toBe(true);
  });

  it('DISC-10 leaves myCopyId null when the caller has no live copy', async () => {
    const h = harness('public');
    h.recipes.find.mockResolvedValue([]);

    const detail = await h.service.toDetail(sourceRow(), versionRow(), ME);

    expect(detail.myCopyId).toBeNull();
    expect(detail.updateAvailable).toBe(false);
  });

  it('SAVE-10 never calls someone else’s recipe behind a copy with no synced version', async () => {
    const h = harness('public');
    h.recipes.find.mockResolvedValue([
      { id: 'copy-1', savedFromRecipeId: 'source-1', syncedVersionNumber: null },
    ]);

    const detail = await h.service.toDetail(sourceRow(), versionRow(), ME);

    expect(detail.myCopyId).toBe('copy-1');
    expect(detail.updateAvailable).toBe(false);
  });

  it('DISC-10 leaves myCopyId null and updateAvailable false on a recipe the caller wrote', async () => {
    const h = harness('own', true);

    const detail = await h.service.toDetail(
      recipeRow({ ownerId: ME, visibility: 'public' }),
      versionRow(),
      ME,
    );

    expect(detail.myCopyId).toBeNull();
    expect(detail.updateAvailable).toBe(false);
    expect(h.recipes.find).not.toHaveBeenCalled();
  });
});

describe('RecipeDtoService.cardsFor (SAVE-3, SAVE-7, SAVE-10)', () => {
  it('SAVE-7 classifies unforked copies as "saved" and forks as "own" on Home cards', async () => {
    const h = harness('none');
    h.users.find.mockResolvedValue([{ id: ME, username: 'me' }]);

    const cards = await h.service.cardsFor(ME, [
      copyRow({ id: 'copy-saved', syncedVersionNumber: null }),
      copyRow({
        id: 'copy-fork',
        forkedAt: AT,
        forkedFromRecipeId: 'source-1',
        syncedVersionNumber: null,
      }),
      recipeRow({
        id: 'meal-saved',
        ownerId: ME,
        source: 'themealdb',
        currentVersion: versionRow({ recipeId: 'meal-saved' }),
      }),
      recipeRow({
        id: 'meal-fork',
        ownerId: ME,
        source: 'themealdb',
        forkedAt: AT,
        currentVersion: versionRow({ recipeId: 'meal-fork' }),
      }),
    ]);

    expect(cards.map((card) => [card.id, card.relation])).toEqual([
      ['copy-saved', 'saved'],
      ['copy-fork', 'own'],
      ['meal-saved', 'saved'],
      ['meal-fork', 'own'],
    ]);
  });

  it('SAVE-10 sets the "Update available" flag on each Home copy that is behind a viewable source', async () => {
    const h = harness('none');
    h.recipes.find.mockResolvedValue([
      sourceRow(),
      sourceRow({
        id: 'source-2',
        currentVersion: versionRow({ recipeId: 'source-2', versionNumber: 5 }),
      }),
    ]);

    const cards = await h.service.cardsFor(ME, [
      copyRow({ id: 'copy-behind', syncedVersionNumber: 2 }),
      copyRow({
        id: 'copy-current',
        savedFromRecipeId: 'source-2',
        syncedVersionNumber: 5,
      }),
    ]);

    expect(
      cards.map((card) => [card.id, card.updateAvailable, card.myCopyId]),
    ).toEqual([
      ['copy-behind', true, null],
      ['copy-current', false, null],
    ]);
    // One query for every source of the page, not one per card.
    expect(h.recipes.find).toHaveBeenCalledTimes(1);
    expect(h.recipes.find).toHaveBeenCalledWith({
      where: { id: In(['source-1', 'source-2']), deletedAt: IsNull() },
      relations: { currentVersion: true },
    });
  });
});

describe('RecipeDtoService.listPublicCards (DISC-1, DISC-10, SAVE-7)', () => {
  it('SAVE-7 uses relationOf: the caller’s own recipe and their published fork are "own", others "public"', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([
        recipeRow({
          id: 'mine',
          ownerId: ME,
          visibility: 'public',
          currentVersion: versionRow({ recipeId: 'mine' }),
        }),
        copyRow({
          id: 'my-fork',
          visibility: 'public',
          forkedAt: AT,
          forkedFromRecipeId: 'source-1',
        }),
        sourceRow(),
      ])
      .mockResolvedValue([]);

    const page = await h.service.listPublicCards(ME, { page: 1, pageSize: 20 });

    expect(page.cards.map((card) => [card.id, card.relation])).toEqual([
      ['mine', 'own'],
      ['my-fork', 'own'],
      ['source-1', 'public'],
    ]);
  });

  it('DISC-10, SAVE-10 marks the public cards the caller has a live copy of, with the update flag', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([
        sourceRow(),
        sourceRow({
          id: 'source-2',
          currentVersion: versionRow({ recipeId: 'source-2', versionNumber: 1 }),
        }),
        sourceRow({
          id: 'source-3',
          currentVersion: versionRow({ recipeId: 'source-3', versionNumber: 1 }),
        }),
      ])
      .mockResolvedValueOnce([
        { id: 'copy-1', savedFromRecipeId: 'source-1', syncedVersionNumber: 2 },
        { id: 'copy-2', savedFromRecipeId: 'source-2', syncedVersionNumber: 1 },
      ]);

    const page = await h.service.listPublicCards(ME, { page: 1, pageSize: 20 });

    expect(
      page.cards.map((card) => [card.id, card.myCopyId, card.updateAvailable]),
    ).toEqual([
      ['source-1', 'copy-1', true],
      ['source-2', 'copy-2', false],
      ['source-3', null, false],
    ]);
    expect(h.recipes.find).toHaveBeenLastCalledWith({
      where: {
        ownerId: ME,
        savedFromRecipeId: In(['source-1', 'source-2', 'source-3']),
        deletedAt: IsNull(),
      },
      select: { id: true, savedFromRecipeId: true, syncedVersionNumber: true },
    });
  });

  it('DISC-9 page 1 skips no rows and asks for one row past the page', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, { page: 1, pageSize: 20 });

    expect(h.recipes.find).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 21,
        order: { updatedAt: 'DESC' },
      }),
    );
  });

  it('DISC-9 page n skips (n − 1) × pageSize rows', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, { page: 2, pageSize: 20 });
    await h.service.listPublicCards(ME, { page: 3, pageSize: 8 });

    expect(h.recipes.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ skip: 20, take: 21 }),
    );
    expect(h.recipes.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ skip: 16, take: 9 }),
    );
  });

  it('DISC-9 treats a page below 1 as page 1', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, { page: 0, pageSize: 20 });

    expect(h.recipes.find).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  it('DISC-9 returns pageSize cards and hasMore when the extra row exists', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([
        sourceRow({ id: 'p1' }),
        sourceRow({ id: 'p2' }),
        sourceRow({ id: 'p3' }),
      ])
      .mockResolvedValue([]);

    const page = await h.service.listPublicCards(ME, { page: 1, pageSize: 2 });

    expect(page.cards.map((card) => card.id)).toEqual(['p1', 'p2']);
    expect(page.hasMore).toBe(true);
  });

  it('DISC-9 reports no more when the page is not full', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([sourceRow({ id: 'p1' }), sourceRow({ id: 'p2' })])
      .mockResolvedValue([]);

    const page = await h.service.listPublicCards(ME, { page: 1, pageSize: 2 });

    expect(page.cards).toHaveLength(2);
    expect(page.hasMore).toBe(false);
  });
});

describe('RecipeDtoService.listPublicCards recommendation exclusions (WX-10, BUG-027)', () => {
  /** The `where` of the page query: the find call that asks for public rows. */
  function pageWhere(h: Harness): Record<string, unknown> {
    const call = (h.recipes.find.mock.calls as [{ where: Record<string, unknown> }][])
      .map(([options]) => options)
      .find((options) => options.where['visibility'] === 'public');
    if (call === undefined) throw new Error('no page query was made');
    return call.where;
  }

  it('DISC-1 the Discover feed without exclusions keeps own recipes and copied sources and reads no copies first', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, { page: 1, pageSize: 20 });

    expect(h.recipes.find).toHaveBeenCalledTimes(1);
    expect(pageWhere(h)).toEqual({ visibility: 'public', deletedAt: IsNull() });
  });

  it('WX-10 excludeOwnerId leaves out the recipes that user owns', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, {
      page: 1,
      pageSize: 30,
      excludeOwnerId: ME,
    });

    expect(h.recipes.find).toHaveBeenCalledTimes(1);
    expect(pageWhere(h)).toEqual({
      visibility: 'public',
      deletedAt: IsNull(),
      ownerId: Not(ME),
    });
  });

  it('WX-10 excludeCopiedBy reads that user live copies (saved copies and forks, not deleted) before the page', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([
        { id: 'copy-1', savedFromRecipeId: 'source-1' },
        { id: 'fork-2', savedFromRecipeId: 'source-2' },
      ])
      .mockResolvedValue([]);

    await h.service.listPublicCards(ME, {
      page: 1,
      pageSize: 30,
      excludeCopiedBy: ME,
    });

    expect(h.recipes.find).toHaveBeenNthCalledWith(1, {
      where: {
        ownerId: ME,
        savedFromRecipeId: Not(IsNull()),
        deletedAt: IsNull(),
      },
      select: { id: true, savedFromRecipeId: true },
    });
    expect(pageWhere(h)).toEqual({
      visibility: 'public',
      deletedAt: IsNull(),
      id: Not(In(['source-1', 'source-2'])),
    });
  });

  it('WX-10 merges the copied sources with excludeIds, each id once', async () => {
    const h = harness('none');
    h.recipes.find
      .mockResolvedValueOnce([
        { id: 'copy-1', savedFromRecipeId: 'source-1' },
        { id: 'copy-1b', savedFromRecipeId: 'source-1' },
        { id: 'copy-2', savedFromRecipeId: 'shown-1' },
      ])
      .mockResolvedValue([]);

    await h.service.listPublicCards(ME, {
      page: 1,
      pageSize: 30,
      excludeIds: ['shown-1', 'shown-2'],
      excludeOwnerId: ME,
      excludeCopiedBy: ME,
    });

    expect(pageWhere(h)).toEqual({
      visibility: 'public',
      deletedAt: IsNull(),
      ownerId: Not(ME),
      id: Not(In(['shown-1', 'shown-2', 'source-1'])),
    });
  });

  it('WX-10 adds no id clause when the user has no live copy and nothing else is excluded', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, {
      page: 1,
      pageSize: 30,
      excludeIds: [],
      excludeCopiedBy: ME,
    });

    expect(h.recipes.find).toHaveBeenCalledTimes(2);
    expect(pageWhere(h)).toEqual({ visibility: 'public', deletedAt: IsNull() });
  });

  it('WX-5 excludeIds alone still leaves out the shown ids', async () => {
    const h = harness('none');

    await h.service.listPublicCards(ME, {
      page: 1,
      pageSize: 30,
      excludeIds: ['shown-1'],
    });

    expect(h.recipes.find).toHaveBeenCalledTimes(1);
    expect(pageWhere(h)).toEqual({
      visibility: 'public',
      deletedAt: IsNull(),
      id: Not(In(['shown-1'])),
    });
  });
});

describe('RecipeDtoService.catalogueCopyIds (DISC-10, CAT-7)', () => {
  it('DISC-10 maps each idMeal to the caller’s live TheMealDB copy', async () => {
    const h = harness('none');
    h.recipes.find.mockResolvedValue([
      { id: 'copy-a', externalId: '52772' },
      { id: 'copy-b', externalId: '52959' },
    ]);

    const copies = await h.service.catalogueCopyIds(ME, [
      '52772',
      '52959',
      '52772',
      '53000',
    ]);

    expect(copies).toEqual(
      new Map([
        ['52772', 'copy-a'],
        ['52959', 'copy-b'],
      ]),
    );
    expect(copies.has('53000')).toBe(false);
    expect(h.recipes.find).toHaveBeenCalledWith({
      where: {
        ownerId: ME,
        source: 'themealdb',
        externalId: In(['52772', '52959', '53000']),
        savedFromRecipeId: IsNull(),
        deletedAt: IsNull(),
      },
      select: { id: true, externalId: true },
    });
  });

  it('CAT-7, DISC-10 leaves out copies of another user’s published TheMealDB fork (saved_from_recipe_id set)', async () => {
    const h = harness('none');

    await h.service.catalogueCopyIds(ME, ['52772']);

    const [firstCall] = h.recipes.find.mock.calls as [
      { where: Record<string, unknown> },
    ][];
    expect(firstCall[0].where['savedFromRecipeId']).toEqual(IsNull());
    expect(firstCall[0].where['source']).toBe('themealdb');
  });

  it('DISC-10 skips the query for an empty list', async () => {
    const h = harness('none');

    await expect(h.service.catalogueCopyIds(ME, [])).resolves.toEqual(new Map());
    expect(h.recipes.find).not.toHaveBeenCalled();
  });
});

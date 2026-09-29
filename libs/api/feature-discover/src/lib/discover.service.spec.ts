// SPEC §5 DISC-4..DISC-9 and CAT-2. Hand-written fakes only: no database, no network.
import { NotFoundException } from '@nestjs/common';
import {
  THEMEALDB_ATTRIBUTION,
  type TheMealDbService,
} from '@rsn/api/data-access-themealdb';
import type { AuthUser, UsersService } from '@rsn/api/feature-auth';
import type { RecipeDtoService } from '@rsn/api/feature-recipes';
import type {
  CatalogueItemDto,
  RecipeCardDto,
} from '@rsn/shared/util-contracts';
import { CATEGORIES, type Category } from '@rsn/shared/util-domain';

import { DiscoverService } from './discover.service';

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

function card(id: string, category: Category): RecipeCardDto {
  return {
    id,
    title: `Recipe ${id}`,
    category,
    servings: 2,
    visibility: 'public',
    relation: 'public',
    ownerUsername: 'mika',
    source: 'user',
    imageUrl: null,
    rating: null,
    versionNumber: 1,
    updatedAt: '2026-09-20T08:00:00.000Z',
    myCopyId: null,
    updateAvailable: false,
  };
}

/** §3.3 field names: TheMealDB `idMeal`, `strMeal`, `strMealThumb`. */
function catalogueItem(mealId: string, category: Category): CatalogueItemDto {
  return {
    mealId,
    name: `Meal ${mealId}`,
    thumbnailUrl: `https://www.themealdb.com/images/media/meals/${mealId}.jpg`,
    category,
    myCopyId: null,
  };
}

interface Harness {
  service: DiscoverService;
  users: { findById: jest.Mock; setFavouriteCategories: jest.Mock };
  recipeDtos: { listPublicCards: jest.Mock; catalogueCopyIds: jest.Mock };
  mealDb: { listByCategory: jest.Mock; lookup: jest.Mock };
}

function makeHarness(favouriteCategories: string[] = []): Harness {
  const users = {
    findById: jest.fn().mockResolvedValue({ id: USER.id, favouriteCategories }),
    setFavouriteCategories: jest.fn(),
  };
  const recipeDtos = {
    listPublicCards: jest.fn().mockResolvedValue({ cards: [], hasMore: false }),
    catalogueCopyIds: jest.fn().mockResolvedValue(new Map<string, string>()),
  };
  const mealDb = {
    listByCategory: jest.fn().mockResolvedValue([]),
    lookup: jest.fn().mockResolvedValue(null),
  };

  return {
    service: new DiscoverService(
      users as unknown as UsersService,
      recipeDtos as unknown as RecipeDtoService,
      mealDb as unknown as TheMealDbService,
    ),
    users,
    recipeDtos,
    mealDb,
  };
}

describe('DiscoverService.discover without a category (DISC-5, DISC-6, DISC-7, DISC-9)', () => {
  it('DISC-7 returns all 14 categories in TheMealDB order when nothing is pinned', async () => {
    const harness = makeHarness([]);

    const response = await harness.service.discover(USER);

    expect(response.categories.map((entry) => entry.category)).toEqual([
      ...CATEGORIES,
    ]);
  });

  it('DISC-6 lists the favourites first, then the rest in DISC-7 order', async () => {
    const harness = makeHarness(['Vegan', 'Beef']);

    const response = await harness.service.discover(USER);

    const order = response.categories.map((entry) => entry.category);
    expect(order.slice(0, 2)).toEqual(['Vegan', 'Beef']);
    expect(order.slice(2)).toEqual(
      CATEGORIES.filter((entry) => entry !== 'Vegan' && entry !== 'Beef'),
    );
    expect(order).toHaveLength(14);
  });

  it('DISC-6 flags the pinned categories with isFavourite', async () => {
    const harness = makeHarness(['Vegan']);

    const response = await harness.service.discover(USER);

    expect(response.categories[0]).toMatchObject({
      category: 'Vegan',
      isFavourite: true,
    });
    expect(
      response.categories.filter((entry) => entry.isFavourite),
    ).toHaveLength(1);
  });

  it('DISC-6 ignores stored values that are not one of the 14 categories', async () => {
    const harness = makeHarness(['Tacos', 'Vegan']);

    const response = await harness.service.discover(USER);

    expect(response.categories[0].category).toBe('Vegan');
    expect(response.categories.map((entry) => entry.category)).toHaveLength(14);
  });

  it('DISC-5 asks for the first 8 items of every category', async () => {
    const harness = makeHarness([]);

    await harness.service.discover(USER);

    expect(harness.recipeDtos.listPublicCards).toHaveBeenCalledTimes(14);
    expect(harness.recipeDtos.listPublicCards).toHaveBeenCalledWith(USER.id, {
      category: 'Beef',
      page: 1,
      pageSize: 8,
    });
  });

  it('DISC-5 truncates a long catalogue to 8 items and reports hasMore', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockImplementation(
      async (category: Category) =>
        Array.from({ length: 11 }, (_, index) =>
          catalogueItem(`5300${index}`, category),
        ),
    );

    const response = await harness.service.discover(USER);

    expect(response.categories[0].catalogue).toHaveLength(8);
    expect(response.categories[0].hasMore).toBe(true);
    expect(response.categories[0].page).toBe(1);
  });

  it('DISC-4 serves an empty catalogue instead of failing when TheMealDB is down', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockRejectedValue(
      new Error('themealdb: 503 Service Unavailable'),
    );
    harness.recipeDtos.listPublicCards.mockResolvedValue({
      cards: [card('r1', 'Beef')],
      hasMore: false,
    });

    const response = await harness.service.discover(USER);

    expect(response.categories).toHaveLength(14);
    expect(response.categories[0].catalogue).toEqual([]);
    expect(response.categories[0].recipes).toEqual([card('r1', 'Beef')]);
  });

  it('DISC-4 carries the TheMealDB attribution on the response', async () => {
    const harness = makeHarness([]);

    const response = await harness.service.discover(USER);

    expect(response.attribution).toBe(THEMEALDB_ATTRIBUTION);
    expect(response.attribution.length).toBeGreaterThan(0);
  });
});

describe('DiscoverService.discover with a category (DISC-1, DISC-4, DISC-9)', () => {
  it('DISC-9 returns exactly that one category', async () => {
    const harness = makeHarness([]);

    const response = await harness.service.discover(USER, 'Seafood');

    expect(response.categories).toHaveLength(1);
    expect(response.categories[0].category).toBe('Seafood');
  });

  it('DISC-9 asks for 20 public recipes per page', async () => {
    const harness = makeHarness([]);

    await harness.service.discover(USER, 'Seafood', 1);

    expect(harness.recipeDtos.listPublicCards).toHaveBeenCalledWith(USER.id, {
      category: 'Seafood',
      page: 1,
      pageSize: 20,
    });
  });

  it('DISC-9 defaults to page 1 when no page is asked for', async () => {
    const harness = makeHarness([]);

    const response = await harness.service.discover(USER, 'Seafood');

    expect(response.categories[0].page).toBe(1);
    expect(harness.recipeDtos.listPublicCards).toHaveBeenCalledWith(
      USER.id,
      expect.objectContaining({ page: 1 }),
    );
  });

  it('DISC-4 serves the catalogue entries of the category on page 1', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockResolvedValue([
      catalogueItem('52959', 'Seafood'),
    ]);

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(harness.mealDb.listByCategory).toHaveBeenCalledWith('Seafood');
    expect(response.categories[0].catalogue).toEqual([
      catalogueItem('52959', 'Seafood'),
    ]);
  });

  it('DISC-9 leaves the catalogue out past page 1, since it is not paged', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockResolvedValue([
      catalogueItem('52959', 'Seafood'),
    ]);

    const response = await harness.service.discover(USER, 'Seafood', 2);

    expect(harness.mealDb.listByCategory).not.toHaveBeenCalled();
    expect(response.categories[0].catalogue).toEqual([]);
    expect(response.categories[0].page).toBe(2);
  });

  it('DISC-9 passes hasMore through from the recipe page', async () => {
    const harness = makeHarness([]);
    harness.recipeDtos.listPublicCards.mockResolvedValue({
      cards: [card('r1', 'Seafood')],
      hasMore: true,
    });

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(response.categories[0].hasMore).toBe(true);
    expect(response.categories[0].recipes).toEqual([card('r1', 'Seafood')]);
  });

  it('DISC-6 flags the asked-for category as a favourite when it is pinned', async () => {
    const harness = makeHarness(['Seafood']);

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(response.categories[0].isFavourite).toBe(true);
  });

  it('DISC-4 serves an empty catalogue when TheMealDB fails for this category', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockRejectedValue(new Error('network down'));

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(response.categories[0].catalogue).toEqual([]);
    expect(response.attribution).toBe(THEMEALDB_ATTRIBUTION);
  });
});

describe('DiscoverService.cataloguePreview (CAT-2)', () => {
  it('CAT-2 reports 404 when TheMealDB knows no such meal', async () => {
    const harness = makeHarness([]);
    harness.mealDb.lookup.mockResolvedValue(null);

    await expect(harness.service.cataloguePreview(USER.id, '99999')).rejects.toThrow(
      NotFoundException,
    );
    await expect(harness.service.cataloguePreview(USER.id, '99999')).rejects.toThrow(
      'Unknown catalogue recipe 99999',
    );
  });

  it('CAT-2 maps the looked-up meal to the preview with its attribution', async () => {
    const harness = makeHarness([]);
    // §3.3 field names of one TheMealDB `lookup.php?i=` record.
    harness.mealDb.lookup.mockResolvedValue({
      idMeal: '52772',
      strMeal: 'Teriyaki Chicken Casserole',
      strCategory: 'Chicken',
      strArea: 'Japanese',
      strInstructions: 'Preheat oven to 175C.\r\nMix the sauce.',
      strMealThumb:
        'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
      strIngredient1: 'soy sauce',
      strMeasure1: '3/4 cup',
    });

    const preview = await harness.service.cataloguePreview(USER.id, '52772');

    expect(harness.mealDb.lookup).toHaveBeenCalledWith('52772');
    expect(preview.mealId).toBe('52772');
    expect(preview.title).toBe('Teriyaki Chicken Casserole');
    expect(preview.category).toBe('Chicken');
    expect(preview.area).toBe('Japanese');
    expect(preview.thumbnailUrl).toBe(
      'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
    );
    expect(preview.attribution).toBe(THEMEALDB_ATTRIBUTION);
  });
});

describe('DiscoverService DISC-10 myCopyId on catalogue items', () => {
  /** §3.3 field names of one TheMealDB `lookup.php?i=` record. */
  const MEAL = {
    idMeal: '52772',
    strMeal: 'Teriyaki Chicken Casserole',
    strCategory: 'Chicken',
    strArea: 'Japanese',
    strInstructions: 'Preheat oven to 175C.\r\nMix the sauce.',
    strMealThumb:
      'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',
    strIngredient1: 'soy sauce',
    strMeasure1: '3/4 cup',
  };

  it('DISC-10 gives the TheMealDB preview the id of the caller’s live copy', async () => {
    const harness = makeHarness([]);
    harness.mealDb.lookup.mockResolvedValue(MEAL);
    harness.recipeDtos.catalogueCopyIds.mockResolvedValue(
      new Map([['52772', 'copy-1']]),
    );

    const preview = await harness.service.cataloguePreview(USER.id, '52772');

    expect(harness.recipeDtos.catalogueCopyIds).toHaveBeenCalledWith(USER.id, [
      '52772',
    ]);
    expect(preview.myCopyId).toBe('copy-1');
  });

  it('DISC-10 leaves the preview’s myCopyId null when the caller has no copy', async () => {
    const harness = makeHarness([]);
    harness.mealDb.lookup.mockResolvedValue(MEAL);

    const preview = await harness.service.cataloguePreview(USER.id, '52772');

    expect(preview.myCopyId).toBeNull();
  });

  it('DISC-10 does not look for copies of a meal TheMealDB does not know', async () => {
    const harness = makeHarness([]);
    harness.mealDb.lookup.mockResolvedValue(null);

    await expect(
      harness.service.cataloguePreview(USER.id, '99999'),
    ).rejects.toThrow(NotFoundException);
    expect(harness.recipeDtos.catalogueCopyIds).not.toHaveBeenCalled();
  });

  it('DISC-9, DISC-10 marks the catalogue entries of one category the caller has a copy of', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockResolvedValue([
      catalogueItem('52959', 'Seafood'),
      catalogueItem('52960', 'Seafood'),
    ]);
    harness.recipeDtos.catalogueCopyIds.mockResolvedValue(
      new Map([['52960', 'copy-9']]),
    );

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(harness.recipeDtos.catalogueCopyIds).toHaveBeenCalledWith(USER.id, [
      '52959',
      '52960',
    ]);
    expect(
      response.categories[0].catalogue.map((item) => [item.mealId, item.myCopyId]),
    ).toEqual([
      ['52959', null],
      ['52960', 'copy-9'],
    ]);
  });

  it('DISC-10 asks for no copies when the category has no catalogue entries (page 2)', async () => {
    const harness = makeHarness([]);

    await harness.service.discover(USER, 'Seafood', 2);

    expect(harness.recipeDtos.catalogueCopyIds).not.toHaveBeenCalled();
  });

  it('DISC-5, DISC-10 marks the split view’s catalogue with one lookup for the 8 shown items of every category', async () => {
    const harness = makeHarness([]);
    harness.mealDb.listByCategory.mockImplementation(
      async (category: Category) =>
        category === 'Beef'
          ? Array.from({ length: 10 }, (_, index) =>
              catalogueItem(`5200${index}`, 'Beef'),
            )
          : category === 'Seafood'
            ? [catalogueItem('52959', 'Seafood')]
            : [],
    );
    harness.recipeDtos.catalogueCopyIds.mockResolvedValue(
      new Map([
        ['52003', 'copy-beef'],
        ['52959', 'copy-fish'],
      ]),
    );

    const response = await harness.service.discover(USER);

    expect(harness.recipeDtos.catalogueCopyIds).toHaveBeenCalledTimes(1);
    expect(harness.recipeDtos.catalogueCopyIds).toHaveBeenCalledWith(USER.id, [
      ...Array.from({ length: 8 }, (_, index) => `5200${index}`),
      '52959',
    ]);
    const beef = response.categories.find((entry) => entry.category === 'Beef');
    const seafood = response.categories.find(
      (entry) => entry.category === 'Seafood',
    );
    expect(beef?.catalogue).toHaveLength(8);
    expect(beef?.catalogue.find((item) => item.mealId === '52003')?.myCopyId).toBe(
      'copy-beef',
    );
    expect(
      beef?.catalogue
        .filter((item) => item.mealId !== '52003')
        .every((item) => item.myCopyId === null),
    ).toBe(true);
    expect(seafood?.catalogue).toEqual([
      { ...catalogueItem('52959', 'Seafood'), myCopyId: 'copy-fish' },
    ]);
  });

  it('DISC-10 asks for no copies when every catalogue is empty', async () => {
    const harness = makeHarness([]);

    await harness.service.discover(USER);

    expect(harness.recipeDtos.catalogueCopyIds).not.toHaveBeenCalled();
  });

  it('DISC-10 passes the public cards’ myCopyId and updateAvailable through from the recipe page', async () => {
    const harness = makeHarness([]);
    const saved = {
      ...card('r1', 'Seafood'),
      myCopyId: 'copy-1',
      updateAvailable: true,
    };
    harness.recipeDtos.listPublicCards.mockResolvedValue({
      cards: [saved],
      hasMore: false,
    });

    const response = await harness.service.discover(USER, 'Seafood', 1);

    expect(response.categories[0].recipes).toEqual([saved]);
  });
});

describe('DiscoverService.setFavouriteCategories (DISC-6, DISC-9)', () => {
  it('DISC-6 hands the list to the users service unchanged', async () => {
    const harness = makeHarness([]);
    harness.users.setFavouriteCategories.mockResolvedValue({
      id: USER.id,
      username: 'rotem',
      email: null,
      favouriteCategories: ['Vegan', 'Beef'],
    });

    const dto = await harness.service.setFavouriteCategories(USER.id, [
      'Vegan',
      'Beef',
    ]);

    expect(harness.users.setFavouriteCategories).toHaveBeenCalledWith(USER.id, [
      'Vegan',
      'Beef',
    ]);
    expect(dto.favouriteCategories).toEqual(['Vegan', 'Beef']);
  });
});

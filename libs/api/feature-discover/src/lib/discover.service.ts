import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  THEMEALDB_ATTRIBUTION,
  TheMealDbService,
  toCataloguePreview,
} from '@rsn/api/data-access-themealdb';
import { type AuthUser, UsersService } from '@rsn/api/feature-auth';
import { RecipeDtoService } from '@rsn/api/feature-recipes';
import type {
  CatalogueItemDto,
  CataloguePreviewDto,
  DiscoverCategoryDto,
  DiscoverResponse,
  UserDto,
} from '@rsn/shared/util-contracts';
import { CATEGORIES, type Category, isCategory } from '@rsn/shared/util-domain';

/** DISC-9: 20 public recipes per page when one category is asked for. */
const CATEGORY_PAGE_SIZE = 20;

/** DISC-9: the split view (DISC-5) shows the first 8 items of every category. */
const OVERVIEW_PAGE_SIZE = 8;

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    private readonly users: UsersService,
    private readonly recipeDtos: RecipeDtoService,
    private readonly mealDb: TheMealDbService,
  ) {}

  /**
   * DISC-1, DISC-4, DISC-5, DISC-9, DISC-10: with a category, one section of public
   * recipes (20 per page) followed by that category's catalogue entries;
   * without one, all 14 categories (DISC-7) with favourites first (DISC-6)
   * and the first 8 items of each.
   */
  async discover(
    user: AuthUser,
    category?: Category,
    page = 1,
  ): Promise<DiscoverResponse> {
    const favourites = await this.favouritesOf(user.id);
    const categories =
      category === undefined
        ? await this.overview(user.id, favourites)
        : [await this.oneCategory(user.id, favourites, category, page)];
    // §3.3: every response that can carry catalogue entries carries the attribution.
    return { categories, attribution: THEMEALDB_ATTRIBUTION };
  }

  /** CAT-2, CAT-6, DISC-10: the live preview of one catalogue meal (`lookup.php?i=`). */
  async cataloguePreview(
    userId: string,
    mealId: string,
  ): Promise<CataloguePreviewDto> {
    const meal = await this.mealDb.lookup(mealId);
    if (meal === null) {
      throw new NotFoundException(`Unknown catalogue recipe ${mealId}`);
    }
    const copies = await this.recipeDtos.catalogueCopyIds(userId, [mealId]);
    return { ...toCataloguePreview(meal), myCopyId: copies.get(mealId) ?? null };
  }

  /** DISC-6, DISC-9: `PUT /me/favourite-categories` (at most 3). */
  setFavouriteCategories(
    userId: string,
    categories: Category[],
  ): Promise<UserDto> {
    return this.users.setFavouriteCategories(userId, categories);
  }

  /** DISC-9: one category, `page` of public recipes plus the catalogue on page 1. */
  private async oneCategory(
    userId: string,
    favourites: Category[],
    category: Category,
    page: number,
  ): Promise<DiscoverCategoryDto> {
    const [recipes, catalogue] = await Promise.all([
      this.recipeDtos.listPublicCards(userId, {
        category,
        page,
        pageSize: CATEGORY_PAGE_SIZE,
      }),
      // The catalogue is not paged, so it is served with the first page only.
      page === 1 ? this.catalogueFor(category) : Promise.resolve([]),
    ]);
    return {
      category,
      isFavourite: favourites.includes(category),
      recipes: recipes.cards,
      catalogue: await this.withCopyIds(userId, catalogue),
      page,
      hasMore: recipes.hasMore,
    };
  }

  /**
   * DISC-5, DISC-6, DISC-9: every category with its first 8 items, the caller's
   * favourites first in the order they stored them, then the rest in DISC-7 order.
   */
  private async overview(
    userId: string,
    favourites: Category[],
  ): Promise<DiscoverCategoryDto[]> {
    const ordered: Category[] = [
      ...favourites,
      ...CATEGORIES.filter((entry) => !favourites.includes(entry)),
    ];
    const [recipeLists, catalogues] = await Promise.all([
      Promise.all(
        ordered.map((entry) =>
          this.recipeDtos.listPublicCards(userId, {
            category: entry,
            page: 1,
            pageSize: OVERVIEW_PAGE_SIZE,
          }),
        ),
      ),
      // One catch per call: a category whose catalogue fails still shows its recipes.
      Promise.all(ordered.map((entry) => this.catalogueFor(entry))),
    ]);
    const shown = await this.withCopyIds(
      userId,
      catalogues.flatMap((catalogue) => catalogue.slice(0, OVERVIEW_PAGE_SIZE)),
    );
    const shownByMealId = new Map(shown.map((item) => [item.mealId, item]));
    return ordered.map((entry, index) => {
      const recipes = recipeLists[index];
      const catalogue = catalogues[index];
      return {
        category: entry,
        isFavourite: favourites.includes(entry),
        recipes: recipes.cards,
        catalogue: catalogue
          .slice(0, OVERVIEW_PAGE_SIZE)
          .map((item) => shownByMealId.get(item.mealId) ?? item),
        page: 1,
        hasMore: recipes.hasMore || catalogue.length > OVERVIEW_PAGE_SIZE,
      };
    });
  }

  /**
   * DISC-4, CAT-6: the catalogue entries of one category. A catalogue outage
   * (a missing key included) degrades Discover to user recipes instead of
   * failing the whole request.
   */
  private async catalogueFor(category: Category): Promise<CatalogueItemDto[]> {
    try {
      return await this.mealDb.listByCategory(category);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `TheMealDB catalogue for ${category} is unavailable (${reason}); serving an empty catalogue`,
      );
      return [];
    }
  }

  /** DISC-10, CAT-7: marks the catalogue entries the caller already has a copy of. */
  private async withCopyIds(
    userId: string,
    items: CatalogueItemDto[],
  ): Promise<CatalogueItemDto[]> {
    if (items.length === 0) return items;
    const copies = await this.recipeDtos.catalogueCopyIds(
      userId,
      items.map((item) => item.mealId),
    );
    return items.map((item) => ({
      ...item,
      myCopyId: copies.get(item.mealId) ?? null,
    }));
  }

  /** DISC-6: the caller's stored favourites, in their stored order, deduplicated. */
  private async favouritesOf(userId: string): Promise<Category[]> {
    const user = await this.users.findById(userId);
    const stored = (user?.favouriteCategories ?? []).filter(
      (entry): entry is Category => isCategory(entry),
    );
    return [...new Set(stored)];
  }
}

// §11.6 response bodies: RecipeEntity + RecipeVersionEntity -> RecipeCardDto / RecipeDetailDto.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import {
  RatingEntity,
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
  UserEntity,
} from '@rsn/api/data-access-db';
import { ImageStorageService } from '@rsn/api/data-access-images';
import { THEMEALDB_ATTRIBUTION } from '@rsn/api/data-access-themealdb';
import type { Category, RecipeRelation } from '@rsn/shared/util-domain';
import type {
  RecipeAttributionDto,
  RecipeCardDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { RecipeAccessService, relationOf } from './recipe-access.service';

/** Options of `listPublicCards` (DISC-1..5, WX-6). */
export interface PublicCardsOptions {
  category?: Category;
  page: number;
  pageSize: number;
  excludeIds?: string[];
}

/** What `listPublicCards` returns: one page plus the "there is more" flag. */
export interface PublicCardsPage {
  cards: RecipeCardDto[];
  hasMore: boolean;
}

@Injectable()
export class RecipeDtoService {
  constructor(
    @InjectRepository(RecipeEntity)
    private readonly recipes: Repository<RecipeEntity>,
    @InjectRepository(RecipeVersionEntity)
    private readonly versions: Repository<RecipeVersionEntity>,
    @InjectRepository(RecipeShareEntity)
    private readonly shares: Repository<RecipeShareEntity>,
    @InjectRepository(RatingEntity)
    private readonly ratings: Repository<RatingEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly images: ImageStorageService,
    private readonly access: RecipeAccessService,
  ) {}

  /**
   * §11.6 `GET /recipes`: one card. IMG-4 signs the version's image paths; a catalogue
   * save has no stored image, so the card falls back to TheMealDB's own URL (CAT-6).
   * RATE-2/4: the rating summary is carried only by public recipes.
   */
  async toCard(
    recipe: RecipeEntity,
    version: RecipeVersionEntity,
    relation: RecipeRelation,
    ownerUsername: string,
    mine: number | null,
  ): Promise<RecipeCardDto> {
    const [imageUrl] = await this.signedUrlsOf(version);
    return this.cardFrom(
      recipe,
      version,
      relation,
      ownerUsername,
      mine,
      imageUrl ?? null,
    );
  }

  /** REC-4, §11.6 `GET /recipes/:id`: the full recipe for one viewer. */
  async toDetail(
    recipe: RecipeEntity,
    version: RecipeVersionEntity,
    userId: string,
  ): Promise<RecipeDetailDto> {
    const relation = await this.access.relationFor(userId, recipe);
    const owner =
      recipe.owner ??
      (await this.users.findOne({ where: { id: recipe.ownerId } }));
    const isPublic = recipe.visibility === 'public';
    const mine = isPublic ? await this.myStars(userId, recipe.id) : null;

    const imageUrls = (await this.signedUrlsOf(version)).filter(
      (url) => url.length > 0,
    );
    const card = this.cardFrom(
      recipe,
      version,
      relation,
      owner?.username ?? '',
      mine,
      imageUrls[0] ?? recipe.externalImageUrl ?? null,
    );

    const [versionCount, forkedFrom, savedFrom, sharedWithUserIds] =
      await Promise.all([
        this.versions.count({ where: { recipeId: recipe.id } }),
        this.attributionFor(recipe.forkedFromRecipeId),
        this.attributionFor(recipe.savedFromRecipeId),
        this.access.isOwner(userId, recipe)
          ? this.sharedWithUserIds(recipe.id)
          : Promise.resolve<string[]>([]),
      ]);

    return {
      ...card,
      ...(version.description === null
        ? {}
        : { description: version.description }),
      ingredients: version.ingredients,
      steps: version.steps,
      imageUrls,
      // SAVE-2, COOK-5.
      canCook:
        relation === 'own' || relation === 'saved' || relation === 'shared',
      // REC-6: the owner alone edits.
      canEdit: this.access.isOwner(userId, recipe),
      // RATE-1, COM-1, COM-2: grades and votes are public-only; comments also on shares.
      canRate: isPublic,
      hasComments: isPublic || recipe.visibility === 'shared',
      hasVotes: isPublic,
      versionCount,
      forkedFrom,
      savedFrom,
      sharedWithUserIds,
      // CAT-6: TheMealDB requires attribution wherever its content is shown.
      attribution: recipe.source === 'themealdb' ? THEMEALDB_ATTRIBUTION : null,
    };
  }

  /** DISC-1..5, WX-6: a page of public recipes, newest first. */
  async listPublicCards(
    userId: string,
    options: PublicCardsOptions,
  ): Promise<PublicCardsPage> {
    const { category, page, pageSize, excludeIds } = options;
    const rows = await this.recipes.find({
      where: {
        visibility: 'public',
        deletedAt: IsNull(),
        ...(category === undefined ? {} : { currentVersion: { category } }),
        ...(excludeIds === undefined || excludeIds.length === 0
          ? {}
          : { id: Not(In(excludeIds)) }),
      },
      relations: { currentVersion: true, owner: true },
      order: { updatedAt: 'DESC' },
      skip: Math.max(page, 0) * pageSize,
      // One row past the page tells the client whether to offer "more" (DISC-5).
      take: pageSize + 1,
    });

    const pageRows = rows.slice(0, pageSize);
    const relations = new Map<string, RecipeRelation>(
      pageRows.map((recipe) => [
        recipe.id,
        recipe.ownerId === userId
          ? recipe.savedFromRecipeId === null
            ? 'own'
            : 'saved'
          : 'public',
      ]),
    );
    return {
      cards: await this.cardsWithRelations(userId, pageRows, relations),
      hasMore: rows.length > pageSize,
    };
  }

  /** SAVE-3, §11.6 `GET /recipes`: cards for a list the caller already selected. */
  async cardsFor(
    userId: string,
    recipes: RecipeEntity[],
  ): Promise<RecipeCardDto[]> {
    const sharedIds = await this.access.sharedRecipeIds(
      userId,
      recipes.map((recipe) => recipe.id),
    );
    const relations = new Map<string, RecipeRelation>(
      recipes.map((recipe) => [
        recipe.id,
        relationOf(userId, recipe, sharedIds.has(recipe.id)),
      ]),
    );
    return this.cardsWithRelations(userId, recipes, relations);
  }

  /** RATE-4: the caller's own grade, or null when they have not rated the recipe. */
  private async myStars(
    userId: string,
    recipeId: string,
  ): Promise<number | null> {
    const rating = await this.ratings.findOne({ where: { recipeId, userId } });
    return rating?.stars ?? null;
  }

  /** REC-2: the friends a recipe is shared with (shown to its owner only). */
  private async sharedWithUserIds(recipeId: string): Promise<string[]> {
    const rows = await this.shares.find({
      where: { recipeId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** SAVE-6: title and owner of the recipe a copy points at (soft-deleted ones included). */
  private async attributionFor(
    recipeId: string | null,
  ): Promise<RecipeAttributionDto | null> {
    if (recipeId === null) return null;
    const source = await this.recipes.findOne({
      where: { id: recipeId },
      relations: { currentVersion: true, owner: true },
    });
    if (source === null) return null;
    return {
      recipeId: source.id,
      title: source.currentVersion?.title ?? '',
      ownerUsername: source.owner?.username ?? null,
    };
  }

  /** IMG-4: signed URLs for one version; an empty list when Firebase is unconfigured. */
  private async signedUrlsOf(version: RecipeVersionEntity): Promise<string[]> {
    const paths = version.imagePaths ?? [];
    if (paths.length === 0) return [];
    const urls = await this.images.signedUrls(paths);
    return urls.length === paths.length ? urls : [];
  }

  /** The pure part of a card, with the image URL already decided. */
  private cardFrom(
    recipe: RecipeEntity,
    version: RecipeVersionEntity,
    relation: RecipeRelation,
    ownerUsername: string,
    mine: number | null,
    imageUrl: string | null,
  ): RecipeCardDto {
    return {
      id: recipe.id,
      title: version.title,
      category: version.category,
      servings: version.servings,
      ...(version.prepMinutes === null
        ? {}
        : { prepMinutes: version.prepMinutes }),
      ...(version.cookMinutes === null
        ? {}
        : { cookMinutes: version.cookMinutes }),
      visibility: recipe.visibility,
      relation,
      ownerUsername,
      source: recipe.source,
      imageUrl:
        imageUrl !== null && imageUrl.length > 0
          ? imageUrl
          : recipe.externalImageUrl,
      // RATE-2: only public recipes carry grades.
      rating:
        recipe.visibility === 'public'
          ? { average: recipe.ratingAverage, count: recipe.ratingCount, mine }
          : null,
      versionNumber: version.versionNumber,
      updatedAt: new Date(recipe.updatedAt).toISOString(),
    };
  }

  /**
   * Builds many cards with a fixed number of queries: one for the missing versions, one
   * for the owners, one for the caller's grades, and one signing call for every path.
   */
  private async cardsWithRelations(
    userId: string,
    recipes: RecipeEntity[],
    relations: Map<string, RecipeRelation>,
  ): Promise<RecipeCardDto[]> {
    if (recipes.length === 0) return [];

    const versionById = await this.currentVersionsOf(recipes);
    const usernameById = await this.usernamesOf(recipes.map((r) => r.ownerId));
    const starsByRecipeId = await this.myStarsFor(
      userId,
      recipes.filter((r) => r.visibility === 'public').map((r) => r.id),
    );

    // IMG-4: one signing call for every path of the page, then sliced back per recipe.
    const paths: string[] = [];
    for (const recipe of recipes) {
      const version = versionById.get(recipe.id);
      if (version !== undefined) paths.push(...(version.imagePaths ?? []));
    }
    const signed =
      paths.length === 0 ? [] : await this.images.signedUrls(paths);
    const urlByPath = new Map<string, string>(
      signed.length === paths.length
        ? paths.map((path, index) => [path, signed[index] ?? ''])
        : [],
    );

    const cards: RecipeCardDto[] = [];
    for (const recipe of recipes) {
      const version = versionById.get(recipe.id);
      // REC-7: a recipe always has a current version; one without it cannot be shown.
      if (version === undefined) continue;
      const firstUrl = (version.imagePaths ?? [])
        .map((path) => urlByPath.get(path) ?? '')
        .find((url) => url.length > 0);
      cards.push(
        this.cardFrom(
          recipe,
          version,
          relations.get(recipe.id) ?? 'none',
          usernameById.get(recipe.ownerId) ?? '',
          starsByRecipeId.get(recipe.id) ?? null,
          firstUrl ?? null,
        ),
      );
    }
    return cards;
  }

  private async currentVersionsOf(
    recipes: RecipeEntity[],
  ): Promise<Map<string, RecipeVersionEntity>> {
    const byRecipeId = new Map<string, RecipeVersionEntity>();
    const missing: string[] = [];
    for (const recipe of recipes) {
      if (recipe.currentVersion != null) {
        byRecipeId.set(recipe.id, recipe.currentVersion);
      } else if (recipe.currentVersionId !== null) {
        missing.push(recipe.currentVersionId);
      }
    }
    if (missing.length > 0) {
      const rows = await this.versions.find({ where: { id: In(missing) } });
      for (const row of rows) byRecipeId.set(row.recipeId, row);
    }
    return byRecipeId;
  }

  private async usernamesOf(ownerIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ownerIds)];
    if (unique.length === 0) return new Map();
    const owners = await this.users.find({
      where: { id: In(unique) },
      select: { id: true, username: true },
    });
    return new Map(owners.map((owner) => [owner.id, owner.username]));
  }

  private async myStarsFor(
    userId: string,
    recipeIds: string[],
  ): Promise<Map<string, number>> {
    if (recipeIds.length === 0) return new Map();
    const rows = await this.ratings.find({
      where: { userId, recipeId: In(recipeIds) },
      select: { recipeId: true, stars: true },
    });
    return new Map(rows.map((row) => [row.recipeId, row.stars]));
  }
}

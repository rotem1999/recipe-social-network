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
import {
  RecipeAccessService,
  isCopy,
  isSavedCopy,
  relationOf,
} from './recipe-access.service';

/** Options of `listPublicCards` (DISC-1..5, WX-6). */
export interface PublicCardsOptions {
  category?: Category;
  /** 1-based, as in `GET /discover?page=` (DISC-9); page 1 starts at the newest recipe. */
  page: number;
  pageSize: number;
  excludeIds?: string[];
  /** WX-10 (discover candidates): leave out the recipes this user owns. */
  excludeOwnerId?: string;
  /**
   * WX-10 (discover candidates): leave out the recipes this user has a live copy of
   * (DISC-10 `myCopyId`: a saved copy or a fork that is not deleted, SAVE-7).
   */
  excludeCopiedBy?: string;
}

/** What `listPublicCards` returns: one page plus the "there is more" flag. */
export interface PublicCardsPage {
  cards: RecipeCardDto[];
  hasMore: boolean;
}

/** DISC-10, SAVE-10: the caller's copy of a recipe, and whether a copy is behind its source. */
interface CopyState {
  myCopyId: string | null;
  updateAvailable: boolean;
}

const NO_COPY: CopyState = { myCopyId: null, updateAvailable: false };

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
    const [copyStates, versionCount, attribution, sharedWithUserIds] =
      await Promise.all([
        this.copyStatesOf(userId, [recipe]),
        this.versions.count({ where: { recipeId: recipe.id } }),
        this.attributionFor(userId, recipe),
        this.access.isOwner(userId, recipe)
          ? this.sharedWithUserIds(recipe.id)
          : Promise.resolve<string[]>([]),
      ]);
    const card = this.cardFrom(
      recipe,
      version,
      relation,
      owner?.username ?? '',
      mine,
      imageUrls[0] ?? recipe.externalImageUrl ?? null,
      copyStates.get(recipe.id) ?? NO_COPY,
    );
    // SAVE-9: one line, "Saved from" on a saved copy and "Forked from" on a fork.
    const savedCopy = isSavedCopy(recipe);

    return {
      ...card,
      ...(version.description === null
        ? {}
        : { description: version.description }),
      ingredients: version.ingredients,
      steps: version.steps,
      imageUrls,
      // CAT-6, UI-20: kept apart from `imageUrls`, whose indexes address uploaded images (IMG-7).
      externalImageUrl: recipe.externalImageUrl ?? null,
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
      forkedFrom: savedCopy ? null : attribution,
      savedFrom: savedCopy ? attribution : null,
      sharedWithUserIds,
      // CAT-6: TheMealDB requires attribution wherever its content is shown.
      attribution: recipe.source === 'themealdb' ? THEMEALDB_ATTRIBUTION : null,
    };
  }

  /** DISC-1..5, DISC-10, WX-6: a page of public recipes, newest first. */
  async listPublicCards(
    userId: string,
    options: PublicCardsOptions,
  ): Promise<PublicCardsPage> {
    const {
      category,
      page,
      pageSize,
      excludeIds,
      excludeOwnerId,
      excludeCopiedBy,
    } = options;
    // WX-10: the sources of the caller's live copies join the excluded ids.
    const copiedIds =
      excludeCopiedBy === undefined
        ? []
        : await this.liveCopySourceIds(excludeCopiedBy);
    const excluded = [...new Set([...(excludeIds ?? []), ...copiedIds])];
    const rows = await this.recipes.find({
      where: {
        visibility: 'public',
        deletedAt: IsNull(),
        ...(category === undefined ? {} : { currentVersion: { category } }),
        ...(excludeOwnerId === undefined
          ? {}
          : { ownerId: Not(excludeOwnerId) }),
        ...(excluded.length === 0 ? {} : { id: Not(In(excluded)) }),
      },
      relations: { currentVersion: true, owner: true },
      order: { updatedAt: 'DESC' },
      skip: (Math.max(page, 1) - 1) * pageSize,
      // One row past the page tells the client whether to offer "more" (DISC-5).
      take: pageSize + 1,
    });

    const pageRows = rows.slice(0, pageSize);
    // Every row is public, so "shared with the caller" never changes the answer.
    const relations = new Map<string, RecipeRelation>(
      pageRows.map((recipe) => [recipe.id, relationOf(userId, recipe, false)]),
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

  /** DISC-10, CAT-7: the caller's live copy of each TheMealDB meal, by `idMeal`. */
  async catalogueCopyIds(
    userId: string,
    mealIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(mealIds)];
    if (unique.length === 0) return new Map();
    const copies = await this.recipes.find({
      where: {
        ownerId: userId,
        source: 'themealdb',
        externalId: In(unique),
        // A copy of another user's TheMealDB fork carries the idMeal too; it is not the meal's copy.
        savedFromRecipeId: IsNull(),
        deletedAt: IsNull(),
      },
      select: { id: true, externalId: true },
    });
    const byMealId = new Map<string, string>();
    for (const copy of copies) {
      if (copy.externalId !== null) byMealId.set(copy.externalId, copy.id);
    }
    return byMealId;
  }

  /**
   * DISC-10, WX-10: the ids of the user recipes this user has a live copy of. A saved
   * copy and a fork both keep `savedFromRecipeId` (SAVE-7); a deleted fork is not live.
   */
  private async liveCopySourceIds(userId: string): Promise<string[]> {
    const copies = await this.recipes.find({
      where: {
        ownerId: userId,
        savedFromRecipeId: Not(IsNull()),
        deletedAt: IsNull(),
      },
      select: { id: true, savedFromRecipeId: true },
    });
    return [
      ...new Set(
        copies
          .map((copy) => copy.savedFromRecipeId)
          .filter((id): id is string => id !== null),
      ),
    ];
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

  /**
   * SAVE-9: the source a copy came from. A user source carries its current title and
   * owner and is linked only while the caller can still view it (REC-4); a TheMealDB
   * source carries the meal name kept at save time.
   */
  private async attributionFor(
    userId: string,
    recipe: RecipeEntity,
  ): Promise<RecipeAttributionDto | null> {
    if (!isCopy(recipe)) return null;
    const sourceId = recipe.savedFromRecipeId ?? recipe.forkedFromRecipeId;
    if (sourceId === null) {
      return {
        recipeId: null,
        title: recipe.externalTitle ?? '',
        ownerUsername: null,
        source: 'themealdb',
      };
    }
    const source = await this.recipes.findOne({
      where: { id: sourceId },
      relations: { currentVersion: true, owner: true },
    });
    if (source === null) return null;
    const viewable =
      source.deletedAt === null &&
      (await this.access.relationFor(userId, source)) !== 'none';
    return {
      recipeId: viewable ? source.id : null,
      title: source.currentVersion?.title ?? '',
      ownerUsername: source.owner?.username ?? null,
      source: 'user',
    };
  }

  /**
   * DISC-10, SAVE-10 for many recipes with a fixed number of queries. On the caller's own
   * copy of a user recipe: whether its source moved past `syncedVersionNumber` and is still
   * viewable. On someone else's recipe: the caller's live copy (a saved copy or a fork) and
   * whether that copy is behind this recipe's current version.
   */
  private async copyStatesOf(
    userId: string,
    recipes: RecipeEntity[],
  ): Promise<Map<string, CopyState>> {
    const states = new Map<string, CopyState>();
    const mine = recipes.filter(
      (recipe) => recipe.ownerId === userId && recipe.savedFromRecipeId !== null,
    );
    const others = recipes.filter((recipe) => recipe.ownerId !== userId);

    if (mine.length > 0) {
      const sourceIds = [
        ...new Set(mine.map((recipe) => recipe.savedFromRecipeId as string)),
      ];
      const [sources, sharedIds] = await Promise.all([
        this.recipes.find({
          where: { id: In(sourceIds), deletedAt: IsNull() },
          relations: { currentVersion: true },
        }),
        this.access.sharedRecipeIds(userId, sourceIds),
      ]);
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      for (const copy of mine) {
        const source = sourceById.get(copy.savedFromRecipeId as string);
        const updateAvailable =
          source !== undefined &&
          relationOf(userId, source, sharedIds.has(source.id)) !== 'none' &&
          isBehind(copy.syncedVersionNumber, source.currentVersion?.versionNumber);
        states.set(copy.id, { myCopyId: null, updateAvailable });
      }
    }

    if (others.length > 0) {
      const [copies, versionById] = await Promise.all([
        this.recipes.find({
          where: {
            ownerId: userId,
            savedFromRecipeId: In(others.map((recipe) => recipe.id)),
            deletedAt: IsNull(),
          },
          select: { id: true, savedFromRecipeId: true, syncedVersionNumber: true },
        }),
        this.currentVersionsOf(others),
      ]);
      const copyBySourceId = new Map(
        copies.map((copy) => [copy.savedFromRecipeId as string, copy]),
      );
      for (const recipe of others) {
        const copy = copyBySourceId.get(recipe.id);
        if (copy === undefined) continue;
        states.set(recipe.id, {
          myCopyId: copy.id,
          updateAvailable: isBehind(
            copy.syncedVersionNumber,
            versionById.get(recipe.id)?.versionNumber,
          ),
        });
      }
    }
    return states;
  }

  /** IMG-4: signed URLs for one version; an empty list when Firebase is unconfigured. */
  private async signedUrlsOf(version: RecipeVersionEntity): Promise<string[]> {
    const paths = version.imagePaths ?? [];
    if (paths.length === 0) return [];
    const urls = await this.images.signedUrls(paths);
    return urls.length === paths.length ? urls : [];
  }

  /** The pure part of a card, with the image URL and the copy state already decided. */
  private cardFrom(
    recipe: RecipeEntity,
    version: RecipeVersionEntity,
    relation: RecipeRelation,
    ownerUsername: string,
    mine: number | null,
    imageUrl: string | null,
    copyState: CopyState,
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
      myCopyId: copyState.myCopyId,
      updateAvailable: copyState.updateAvailable,
    };
  }

  /**
   * Builds many cards with a fixed number of queries: one for the missing versions, one
   * for the owners, one for the caller's grades, the copy-state queries, and one signing
   * call for every path.
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
    const copyStates = await this.copyStatesOf(userId, recipes);

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
          copyStates.get(recipe.id) ?? NO_COPY,
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

/** SAVE-10: a copy whose recorded source version is unknown is never reported as behind. */
function isBehind(
  syncedVersionNumber: number | null,
  sourceVersionNumber: number | undefined,
): boolean {
  return (
    syncedVersionNumber !== null &&
    sourceVersionNumber !== undefined &&
    sourceVersionNumber > syncedVersionNumber
  );
}

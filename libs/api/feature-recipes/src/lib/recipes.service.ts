// §3 (REC-1..8, IMG-3/6/7, SAVE-1..10, CAT-3/4/7): every write and read of a recipe.
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
} from '@rsn/api/data-access-db';
import { ImageStorageService } from '@rsn/api/data-access-images';
import {
  TheMealDbService,
  toRecipeContent,
} from '@rsn/api/data-access-themealdb';
import { FriendsService } from '@rsn/api/feature-friends';
import {
  MAX_IMAGES_PER_RECIPE,
  MAX_INGREDIENTS,
  MAX_STEPS,
  validateRecipeContent,
  type RecipeContent,
  type Visibility,
} from '@rsn/shared/util-domain';
import type {
  ImageUploadResponse,
  RecipeDetailDto,
  RecipeListResponse,
  RecipeVersionsResponse,
} from '@rsn/shared/util-contracts';
import {
  RecipeAccessService,
  isSavedCopy,
  relationOf,
} from './recipe-access.service';
import { RecipeDtoService } from './recipe-dto.service';

/** WX-4: at most this many of the caller's recipes are offered to the recommender. */
const MAX_RECOMMEND_CANDIDATES = 30;

/** IMG-3: the parts of a multipart upload this service needs. */
export interface RecipeImageUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/** §3.1.1 -> the columns of one `recipe_versions` row. */
function versionColumns(
  content: RecipeContent,
): Pick<
  RecipeVersionEntity,
  | 'title'
  | 'description'
  | 'category'
  | 'servings'
  | 'prepMinutes'
  | 'cookMinutes'
  | 'ingredients'
  | 'steps'
> {
  return {
    title: content.title,
    description: content.description ?? null,
    category: content.category,
    servings: content.servings,
    prepMinutes: content.prepMinutes ?? null,
    cookMinutes: content.cookMinutes ?? null,
    ingredients: content.ingredients,
    steps: content.steps,
  };
}

@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);

  constructor(
    @InjectRepository(RecipeEntity)
    private readonly recipes: Repository<RecipeEntity>,
    @InjectRepository(RecipeVersionEntity)
    private readonly versions: Repository<RecipeVersionEntity>,
    @InjectRepository(RecipeShareEntity)
    private readonly shares: Repository<RecipeShareEntity>,
    private readonly dataSource: DataSource,
    private readonly access: RecipeAccessService,
    private readonly dtos: RecipeDtoService,
    private readonly images: ImageStorageService,
    private readonly friends: FriendsService,
    private readonly theMealDb: TheMealDbService,
  ) {}

  /** SAVE-3, §11.6 `GET /recipes`: own + saved + shared with the caller, newest first. */
  async listMine(userId: string): Promise<RecipeListResponse> {
    const owned = await this.recipes.find({
      where: { ownerId: userId, deletedAt: IsNull() },
      relations: { currentVersion: true },
    });
    const shareRows = await this.shares.find({
      where: { userId },
      select: { recipeId: true },
    });
    const sharedIds = shareRows.map((row) => row.recipeId);
    const shared =
      sharedIds.length === 0
        ? []
        : await this.recipes.find({
            where: { id: In(sharedIds), deletedAt: IsNull() },
            relations: { currentVersion: true },
          });

    const all = [...owned, ...shared].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return { recipes: await this.dtos.cardsFor(userId, all) };
  }

  /** REC-1: a new recipe is private and starts at version 1. */
  async create(
    userId: string,
    content: RecipeContent,
  ): Promise<RecipeDetailDto> {
    this.assertValidContent(content);
    const recipeId = await this.dataSource.transaction(async (manager) => {
      const recipe = await manager.save(
        manager.create(RecipeEntity, {
          ownerId: userId,
          visibility: 'private',
          source: 'user',
          currentVersionId: null,
          savedFromRecipeId: null,
          forkedFromRecipeId: null,
          forkedAt: null,
          syncedVersionNumber: null,
          externalId: null,
          externalTitle: null,
          externalImageUrl: null,
          ratingAverage: null,
          ratingCount: 0,
          deletedAt: null,
        }),
      );
      await this.appendVersion(manager, recipe, content, 1, []);
      return recipe.id;
    });
    return this.get(userId, recipeId);
  }

  /** REC-4, §11.6 `GET /recipes/:id`. */
  async get(userId: string, id: string): Promise<RecipeDetailDto> {
    const recipe = await this.access.loadOrThrow(id);
    await this.access.assertCanView(userId, recipe);
    return this.dtos.toDetail(
      recipe,
      await this.currentVersionOrThrow(recipe),
      userId,
    );
  }

  /**
   * REC-6/7: only the owner edits, and every edit adds a version. SAVE-5/6/7: the first
   * edit of a saved copy makes it a fork and records the recipe it came from.
   */
  async update(
    userId: string,
    id: string,
    content: RecipeContent,
  ): Promise<RecipeDetailDto> {
    this.assertValidContent(content);
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    const previous = await this.currentVersionOrThrow(recipe);

    await this.dataSource.transaction(async (manager) => {
      const nextNumber = (await this.maxVersionNumber(manager, recipe.id)) + 1;
      // IMG-3: images follow the recipe, so a new version inherits the current paths.
      await this.appendVersion(
        manager,
        recipe,
        content,
        nextNumber,
        previous.imagePaths ?? [],
        isSavedCopy(recipe)
          ? {
              forkedAt: new Date(),
              ...(recipe.savedFromRecipeId === null
                ? {}
                : { forkedFromRecipeId: recipe.savedFromRecipeId }),
            }
          : {},
      );
    });
    return this.get(userId, id);
  }

  /** REC-2, REC-3, REC-6, REC-8: visibility and, for `shared`, the friends it reaches. */
  async setVisibility(
    userId: string,
    id: string,
    visibility: Visibility,
    sharedWithUserIds?: string[],
  ): Promise<RecipeDetailDto> {
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    // SAVE-8: a saved copy stays private until its first edit makes it a fork.
    if (isSavedCopy(recipe) && visibility !== 'private') {
      throw new BadRequestException(
        'A saved recipe stays private until you edit it',
      );
    }

    if (visibility === 'shared') {
      const wanted = [...new Set(sharedWithUserIds ?? [])];
      // REC-2, FR-1, §11.6: a recipe is shared with friends only.
      const friendIds = new Set(await this.friends.friendIdsOf(userId));
      if (wanted.some((candidate) => !friendIds.has(candidate))) {
        throw new BadRequestException('You can only share with friends');
      }
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(RecipeShareEntity, { recipeId: recipe.id });
        if (wanted.length > 0) {
          await manager.save(
            wanted.map((shareUserId) =>
              manager.create(RecipeShareEntity, {
                recipeId: recipe.id,
                userId: shareUserId,
              }),
            ),
          );
        }
        await manager.update(RecipeEntity, { id: recipe.id }, { visibility });
      });
    } else {
      // REC-3: leaving `shared` drops every share row.
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(RecipeShareEntity, { recipeId: recipe.id });
        await manager.update(RecipeEntity, { id: recipe.id }, { visibility });
      });
    }
    return this.get(userId, id);
  }

  /**
   * REC-6, SAVE-4, SAVE-7, §12.1: an own recipe or a fork is soft-deleted so saved copies
   * keep their attribution and images; a saved copy is removed outright, together with
   * the image objects it owns (IMG-7).
   */
  async remove(userId: string, id: string): Promise<void> {
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    if (isSavedCopy(recipe)) {
      const versionRows = await this.versions.find({
        where: { recipeId: recipe.id },
        select: { imagePaths: true },
      });
      const ownedPaths = [
        ...new Set(
          versionRows
            .flatMap((row) => row.imagePaths ?? [])
            .filter((path) => ownsImage(recipe.id, path)),
        ),
      ];
      await this.dataSource.transaction(async (manager) => {
        // current_version_id points at a version, so it is cleared before the cascade.
        await manager.update(
          RecipeEntity,
          { id: recipe.id },
          { currentVersionId: null },
        );
        await manager.delete(RecipeEntity, { id: recipe.id });
      });
      for (const path of ownedPaths) await this.removeObject(path);
      return;
    }
    await this.recipes.update({ id: recipe.id }, { deletedAt: new Date() });
  }

  /**
   * SAVE-1, SAVE-4, SAVE-7: a public recipe becomes a private saved copy of the caller's,
   * once; a live fork of it counts as that copy. SAVE-10 records the version it took.
   */
  async save(userId: string, id: string): Promise<RecipeDetailDto> {
    const source = await this.access.loadOrThrow(id);
    if (source.visibility !== 'public') {
      throw new BadRequestException('Only a public recipe can be saved');
    }
    if (source.ownerId === userId) {
      throw new BadRequestException('You already own this recipe');
    }

    // SAVE-1: saving twice returns the copy that already exists.
    const existing = await this.recipes.findOne({
      where: {
        ownerId: userId,
        savedFromRecipeId: source.id,
        deletedAt: IsNull(),
      },
    });
    if (existing !== null) return this.get(userId, existing.id);

    const sourceVersion = await this.currentVersionOrThrow(source);
    const copyId = await this.dataSource.transaction(async (manager) => {
      const copy = await manager.save(
        manager.create(RecipeEntity, {
          ownerId: userId,
          visibility: 'private',
          source: source.source,
          currentVersionId: null,
          savedFromRecipeId: source.id,
          forkedFromRecipeId: null,
          forkedAt: null,
          syncedVersionNumber: sourceVersion.versionNumber,
          externalId: source.externalId,
          externalTitle: source.externalTitle,
          externalImageUrl: source.externalImageUrl,
          ratingAverage: null,
          ratingCount: 0,
          deletedAt: null,
        }),
      );
      await this.appendVersion(
        manager,
        copy,
        contentOf(sourceVersion),
        1,
        sourceVersion.imagePaths ?? [],
      );
      return copy.id;
    });
    return this.get(userId, copyId);
  }

  /** CAT-3, CAT-4, CAT-7: a TheMealDB meal is pulled into the database as a saved copy. */
  async saveCatalogue(
    userId: string,
    mealId: string,
  ): Promise<RecipeDetailDto> {
    // CAT-3: one copy per meal per user.
    const existing = await this.recipes.findOne({
      where: {
        ownerId: userId,
        source: 'themealdb',
        externalId: mealId,
        // A copy of another user's TheMealDB fork carries the idMeal too; it is not the meal's copy.
        savedFromRecipeId: IsNull(),
        deletedAt: IsNull(),
      },
    });
    if (existing !== null) return this.get(userId, existing.id);

    const meal = await this.theMealDb.lookup(mealId);
    if (meal === null) {
      throw new NotFoundException(`TheMealDB has no meal ${mealId}`);
    }
    // CAT-4, CAT-6: the mapper fills servings 2 and the parsed ingredients and steps.
    const mapped = toRecipeContent(meal);
    // §3.1.1 upper limits: a save keeps the first 60 steps and the first 50 ingredients.
    const content: RecipeContent = {
      ...mapped,
      ingredients: mapped.ingredients.slice(0, MAX_INGREDIENTS),
      steps: mapped.steps.slice(0, MAX_STEPS),
    };
    this.assertValidContent(content);

    const recipeId = await this.dataSource.transaction(async (manager) => {
      const recipe = await manager.save(
        manager.create(RecipeEntity, {
          ownerId: userId,
          visibility: 'private',
          source: 'themealdb',
          currentVersionId: null,
          savedFromRecipeId: null,
          forkedFromRecipeId: null,
          forkedAt: null,
          // SAVE-10: TheMealDB copies are never checked for updates.
          syncedVersionNumber: null,
          externalId: mealId,
          // SAVE-9: the meal name at save time, for "Saved from … on TheMealDB".
          externalTitle: content.title,
          // CAT-6: TheMealDB hosts the image; nothing is uploaded to Firebase.
          externalImageUrl: meal.strMealThumb ?? null,
          ratingAverage: null,
          ratingCount: 0,
          deletedAt: null,
        }),
      );
      await this.appendVersion(manager, recipe, content, 1, []);
      return recipe.id;
    });
    return this.get(userId, recipeId);
  }

  /**
   * SAVE-10, `POST /recipes/:id/sync`: the caller's copy of a user recipe takes the
   * source's current content as a new version. A saved copy stays saved, a fork stays a fork.
   */
  async sync(userId: string, id: string): Promise<RecipeDetailDto> {
    const copy = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, copy);
    const source =
      copy.savedFromRecipeId === null
        ? null
        : await this.recipes.findOne({
            where: { id: copy.savedFromRecipeId, deletedAt: IsNull() },
            relations: { currentVersion: true },
          });
    const isShared =
      source === null
        ? false
        : await this.shares.exists({
            where: { recipeId: source.id, userId },
          });
    if (
      source === null ||
      relationOf(userId, source, isShared) === 'none' ||
      source.currentVersion == null ||
      copy.syncedVersionNumber === null ||
      source.currentVersion.versionNumber <= copy.syncedVersionNumber
    ) {
      throw new BadRequestException('This recipe has no update to take');
    }
    const sourceVersion = source.currentVersion;

    await this.dataSource.transaction(async (manager) => {
      const nextNumber = (await this.maxVersionNumber(manager, copy.id)) + 1;
      await this.appendVersion(
        manager,
        copy,
        contentOf(sourceVersion),
        nextNumber,
        sourceVersion.imagePaths ?? [],
        { syncedVersionNumber: sourceVersion.versionNumber },
      );
    });
    return this.get(userId, id);
  }

  /** REC-7: the version history, oldest first; visibility applies to the whole history. */
  async listVersions(
    userId: string,
    id: string,
  ): Promise<RecipeVersionsResponse> {
    const recipe = await this.access.loadOrThrow(id);
    await this.access.assertCanView(userId, recipe);
    const rows = await this.versions.find({
      where: { recipeId: recipe.id },
      order: { versionNumber: 'ASC' },
    });
    return {
      versions: rows.map((row) => ({
        versionNumber: row.versionNumber,
        title: row.title,
        createdAt: new Date(row.createdAt).toISOString(),
        isCurrent: row.id === recipe.currentVersionId,
      })),
    };
  }

  /** REC-7: one past version, readable by everyone who may read the recipe. */
  async getVersion(
    userId: string,
    id: string,
    versionNumber: number,
  ): Promise<RecipeDetailDto> {
    const recipe = await this.access.loadOrThrow(id);
    await this.access.assertCanView(userId, recipe);
    const version = await this.versions.findOne({
      where: { recipeId: recipe.id, versionNumber },
    });
    if (version === null) {
      throw new NotFoundException(`Version ${versionNumber} does not exist`);
    }
    return this.dtos.toDetail(recipe, version, userId);
  }

  /** IMG-3, IMG-6: at most 3 images on the current version; no new version is created. */
  async addImage(
    userId: string,
    id: string,
    file: RecipeImageUpload,
  ): Promise<ImageUploadResponse> {
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    const version = await this.currentVersionOrThrow(recipe);
    const paths = version.imagePaths ?? [];
    if (paths.length >= MAX_IMAGES_PER_RECIPE) {
      throw new BadRequestException(
        `A recipe version carries at most ${MAX_IMAGES_PER_RECIPE} images`,
      );
    }
    // The storage service detects the type from the bytes, checks the size, and answers
    // 503 when the FIREBASE_* keys are empty or the bucket write fails (IMG-6).
    const objectPath = await this.images.upload({
      recipeId: recipe.id,
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    const next = [...paths, objectPath];
    await this.versions.update({ id: version.id }, { imagePaths: next });
    return { imageUrls: await this.signedUrls(next) };
  }

  /**
   * IMG-3, IMG-7: removes one image of the current version. A linked image (a copy's or a
   * sync's, owned by another recipe) only leaves this version; an image this recipe owns
   * is deleted from the bucket and from every version of every recipe that carries it.
   */
  async removeImage(
    userId: string,
    id: string,
    index: number,
  ): Promise<ImageUploadResponse> {
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    const version = await this.currentVersionOrThrow(recipe);
    const paths = version.imagePaths ?? [];
    const objectPath = paths[index];
    if (!Number.isInteger(index) || index < 0 || objectPath === undefined) {
      throw new BadRequestException(`This recipe has no image ${index}`);
    }
    const next = paths.filter((_, position) => position !== index);
    if (!ownsImage(recipe.id, objectPath)) {
      await this.versions.update({ id: version.id }, { imagePaths: next });
      return { imageUrls: await this.signedUrls(next) };
    }
    await this.dataSource.query(
      `UPDATE "recipe_versions"
       SET "image_paths" = array_remove("image_paths", $1), "updated_at" = now()
       WHERE $1 = ANY("image_paths")`,
      [objectPath],
    );
    await this.removeObject(objectPath);
    return { imageUrls: await this.signedUrls(next) };
  }

  /** WX-4: the caller's own and saved recipes the recommender may choose from. */
  async candidatesForRecommend(userId: string): Promise<RecipeEntity[]> {
    return this.recipes.find({
      where: { ownerId: userId, deletedAt: IsNull() },
      relations: { currentVersion: true },
      order: { updatedAt: 'DESC' },
      take: MAX_RECOMMEND_CANDIDATES,
    });
  }

  /** §3.1.1: the invariants of util-domain, on top of the class-validator shape check. */
  private assertValidContent(content: RecipeContent): void {
    const errors = validateRecipeContent(content);
    if (errors.length > 0) throw new BadRequestException(errors);
  }

  /** REC-7: writes one version and points the recipe at it. */
  private async appendVersion(
    manager: EntityManager,
    recipe: RecipeEntity,
    content: RecipeContent,
    versionNumber: number,
    imagePaths: string[],
    recipeColumns: Partial<
      Pick<
        RecipeEntity,
        'forkedAt' | 'forkedFromRecipeId' | 'syncedVersionNumber'
      >
    > = {},
  ): Promise<RecipeVersionEntity> {
    const version = await manager.save(
      manager.create(RecipeVersionEntity, {
        recipeId: recipe.id,
        versionNumber,
        imagePaths,
        ...versionColumns(content),
      }),
    );
    await manager.update(
      RecipeEntity,
      { id: recipe.id },
      {
        currentVersionId: version.id,
        // SAVE-7: the first edit of a saved copy forks it; SAVE-10: a sync records its version.
        ...recipeColumns,
      },
    );
    return version;
  }

  private async maxVersionNumber(
    manager: EntityManager,
    recipeId: string,
  ): Promise<number> {
    const latest = await manager.findOne(RecipeVersionEntity, {
      where: { recipeId },
      order: { versionNumber: 'DESC' },
    });
    return latest?.versionNumber ?? 0;
  }

  private async currentVersionOrThrow(
    recipe: RecipeEntity,
  ): Promise<RecipeVersionEntity> {
    if (recipe.currentVersion != null) return recipe.currentVersion;
    const version =
      recipe.currentVersionId === null
        ? null
        : await this.versions.findOne({
            where: { id: recipe.currentVersionId },
          });
    if (version === null) {
      throw new NotFoundException('This recipe has no current version');
    }
    return version;
  }

  /**
   * IMG-7: the bucket is changed after the database, so a failed delete only leaves an
   * unused object behind; it is logged and the request still succeeds.
   */
  private async removeObject(objectPath: string): Promise<void> {
    try {
      await this.images.remove(objectPath);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Could not delete image ${objectPath} (${reason}); the object is left unused`,
      );
    }
  }

  /** IMG-4: non-empty signed URLs, or an empty list when Firebase is unconfigured. */
  private async signedUrls(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    return (await this.images.signedUrls(paths)).filter(
      (url) => url.length > 0,
    );
  }
}

/** IMG-6, IMG-7: an image belongs to the recipe whose id is in its object path. */
function ownsImage(recipeId: string, objectPath: string): boolean {
  return objectPath.startsWith(`recipes/${recipeId}/`);
}

/** A stored version read back as §3.1.1 content (used when a copy is made). */
function contentOf(version: RecipeVersionEntity): RecipeContent {
  return {
    title: version.title,
    ...(version.description === null
      ? {}
      : { description: version.description }),
    category: version.category,
    servings: version.servings,
    ingredients: version.ingredients,
    steps: version.steps,
    ...(version.prepMinutes === null
      ? {}
      : { prepMinutes: version.prepMinutes }),
    ...(version.cookMinutes === null
      ? {}
      : { cookMinutes: version.cookMinutes }),
  };
}

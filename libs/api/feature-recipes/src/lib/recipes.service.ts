// §3 (REC-1..8, IMG-3/6, SAVE-1..6, CAT-3/4): every write and read of a recipe.
import {
  BadRequestException,
  Injectable,
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
import { RecipeAccessService } from './recipe-access.service';
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
          externalId: null,
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
   * REC-6/7: only the owner edits, and every edit adds a version. SAVE-5/6: the first
   * edit of a saved copy records the fork it came from.
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
        recipe.savedFromRecipeId !== null && recipe.forkedFromRecipeId === null
          ? recipe.savedFromRecipeId
          : undefined,
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

    if (visibility === 'shared') {
      const wanted = [...new Set(sharedWithUserIds ?? [])];
      // REC-2: a recipe is shared with friends only.
      const friendIds = new Set(await this.friends.friendIdsOf(userId));
      const strangers = wanted.filter((candidate) => !friendIds.has(candidate));
      if (strangers.length > 0) {
        throw new BadRequestException(
          'A recipe can only be shared with friends: ' + strangers.join(', '),
        );
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
   * REC-6, SAVE-4, §12.1: an own recipe is soft-deleted so saved copies keep their
   * attribution; a saved copy is removed outright.
   */
  async remove(userId: string, id: string): Promise<void> {
    const recipe = await this.access.loadOrThrow(id);
    this.access.assertIsOwner(userId, recipe);
    if (recipe.savedFromRecipeId !== null) {
      await this.dataSource.transaction(async (manager) => {
        // current_version_id points at a version, so it is cleared before the cascade.
        await manager.update(
          RecipeEntity,
          { id: recipe.id },
          { currentVersionId: null },
        );
        await manager.delete(RecipeEntity, { id: recipe.id });
      });
      return;
    }
    await this.recipes.update({ id: recipe.id }, { deletedAt: new Date() });
  }

  /** SAVE-1, SAVE-4: a public recipe becomes a private copy of the caller's, once. */
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
          externalId: source.externalId,
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

  /** CAT-3, CAT-4: a TheMealDB meal is pulled into the database when it is saved. */
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
        deletedAt: IsNull(),
      },
    });
    if (existing !== null) return this.get(userId, existing.id);

    const meal = await this.theMealDb.lookup(mealId);
    if (meal === null) {
      throw new NotFoundException(`TheMealDB has no meal ${mealId}`);
    }
    // CAT-4, CAT-6: the mapper fills servings 2 and the parsed ingredients and steps.
    const content = toRecipeContent(meal);
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
          externalId: mealId,
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
    // The storage service validates the MIME type and the size and answers 503 when
    // the FIREBASE_* keys are empty (IMG-6).
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

  /** IMG-3: removes one image of the current version from the bucket and the version. */
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
    await this.versions.update({ id: version.id }, { imagePaths: next });
    await this.images.remove(objectPath);
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
    forkedFromRecipeId?: string,
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
        // SAVE-5/6: the first edit of a saved copy records its origin.
        ...(forkedFromRecipeId === undefined ? {} : { forkedFromRecipeId }),
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

  /** IMG-4: non-empty signed URLs, or an empty list when Firebase is unconfigured. */
  private async signedUrls(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    return (await this.images.signedUrls(paths)).filter(
      (url) => url.length > 0,
    );
  }
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

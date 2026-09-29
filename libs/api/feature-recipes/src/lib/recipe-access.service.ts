// REC-2, REC-3, REC-6, REC-7, REC-8, SAVE-2, COOK-5: who may see and cook a recipe.
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RecipeEntity, RecipeShareEntity } from '@rsn/api/data-access-db';
import type { RecipeRelation } from '@rsn/shared/util-domain';

/**
 * REC-8, §11.6 `relation`: the same decision made from data already in hand, so a list
 * can classify many recipes with one query for the caller's shares.
 */
export function relationOf(
  userId: string,
  recipe: RecipeEntity,
  isSharedWithUser: boolean,
): RecipeRelation {
  if (recipe.ownerId === userId) {
    return recipe.savedFromRecipeId === null ? 'own' : 'saved';
  }
  if (isSharedWithUser) return 'shared';
  if (recipe.visibility === 'public') return 'public';
  return 'none';
}

@Injectable()
export class RecipeAccessService {
  constructor(
    @InjectRepository(RecipeEntity)
    private readonly recipes: Repository<RecipeEntity>,
    @InjectRepository(RecipeShareEntity)
    private readonly shares: Repository<RecipeShareEntity>,
  ) {}

  /** §12.1: a soft-deleted recipe is gone for everyone, including its owner. */
  async loadOrThrow(recipeId: string): Promise<RecipeEntity> {
    const recipe = await this.recipes.findOne({
      where: { id: recipeId },
      relations: { currentVersion: true },
    });
    if (recipe === null || recipe.deletedAt !== null) {
      throw new NotFoundException('Recipe not found');
    }
    return recipe;
  }

  /** §11.6 `relation`: own | saved | shared | public | none. */
  async relationFor(
    userId: string,
    recipe: RecipeEntity,
  ): Promise<RecipeRelation> {
    if (recipe.ownerId === userId) {
      return recipe.savedFromRecipeId === null ? 'own' : 'saved';
    }
    const isShared = await this.shares.exists({
      where: { recipeId: recipe.id, userId },
    });
    return relationOf(userId, recipe, isShared);
  }

  /** REC-4, REC-8: everything but `none` may be viewed. */
  async canView(userId: string, recipe: RecipeEntity): Promise<boolean> {
    return (await this.relationFor(userId, recipe)) !== 'none';
  }

  async assertCanView(userId: string, recipe: RecipeEntity): Promise<void> {
    if (!(await this.canView(userId, recipe))) {
      throw new ForbiddenException('You cannot view this recipe');
    }
  }

  /** SAVE-2, COOK-5: a public recipe must be saved before cook mode opens. */
  async canCook(userId: string, recipe: RecipeEntity): Promise<boolean> {
    const relation = await this.relationFor(userId, recipe);
    return relation === 'own' || relation === 'saved' || relation === 'shared';
  }

  async assertCanCook(userId: string, recipe: RecipeEntity): Promise<void> {
    if (!(await this.canCook(userId, recipe))) {
      throw new ForbiddenException('Save this recipe before cooking it');
    }
  }

  /** REC-6: the owner alone edits, sets visibility and deletes (a saved copy is owned). */
  isOwner(userId: string, recipe: RecipeEntity): boolean {
    return recipe.ownerId === userId;
  }

  /** REC-6: throws 403 for everyone but the owner. */
  assertIsOwner(userId: string, recipe: RecipeEntity): void {
    if (!this.isOwner(userId, recipe)) {
      throw new ForbiddenException('Only the owner can change this recipe');
    }
  }

  /** One query for "which of these recipes are shared with me" (REC-8). */
  async sharedRecipeIds(
    userId: string,
    recipeIds: string[],
  ): Promise<Set<string>> {
    if (recipeIds.length === 0) return new Set<string>();
    const rows = await this.shares.find({
      where: { userId, recipeId: In(recipeIds) },
      select: { recipeId: true },
    });
    return new Set(rows.map((row) => row.recipeId));
  }
}

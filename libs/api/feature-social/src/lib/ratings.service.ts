import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RatingEntity, RecipeEntity } from '@rsn/api/data-access-db';
import { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { RatingSummaryDto } from '@rsn/shared/util-contracts';
import { toTwoDecimals } from '@rsn/shared/util-domain';

/** Shape of the aggregate row read back from the `ratings` table (RATE-4). */
interface RatingAggregateRow {
  count: string;
  average: string | null;
}

/** RATE-1..4: whole-star grades on public recipes and the stored average. */
@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(RatingEntity)
    private readonly ratings: Repository<RatingEntity>,
    private readonly access: RecipeAccessService,
  ) {}

  /**
   * RATE-1, RATE-4: upsert the caller's grade, then recompute and store the recipe's
   * average and count in the same transaction. Only public recipes can be rated.
   */
  async rate(
    userId: string,
    recipeId: string,
    stars: number,
  ): Promise<RatingSummaryDto> {
    const recipe = await this.access.loadOrThrow(recipeId);
    await this.access.assertCanView(userId, recipe);
    this.assertRatable(recipe);

    return this.ratings.manager.transaction(
      async (manager: EntityManager): Promise<RatingSummaryDto> => {
        const ratings = manager.getRepository(RatingEntity);
        // RATE-4: one rating per user per recipe; rating again replaces the earlier value.
        const existing = await ratings.findOne({
          where: { recipeId: recipe.id, userId },
        });
        if (existing) {
          existing.stars = stars;
          await ratings.save(existing);
        } else {
          await ratings.save(
            ratings.create({ recipeId: recipe.id, userId, stars }),
          );
        }

        const summary = await this.aggregate(manager, recipe.id);
        // RATE-2: stored as numeric(3,2) on the recipe, recomputed on every write.
        await manager
          .getRepository(RecipeEntity)
          .update(
            { id: recipe.id },
            { ratingAverage: summary.average, ratingCount: summary.count },
          );

        return { average: summary.average, count: summary.count, mine: stars };
      },
    );
  }

  /** RATE-2, RATE-3: the stored average and count plus the caller's own grade. */
  async summary(userId: string, recipeId: string): Promise<RatingSummaryDto> {
    const recipe = await this.access.loadOrThrow(recipeId);
    await this.access.assertCanView(userId, recipe);

    const mine = await this.ratings.findOne({
      where: { recipeId: recipe.id, userId },
    });
    return {
      average: recipe.ratingAverage,
      count: recipe.ratingCount,
      mine: mine ? mine.stars : null,
    };
  }

  /** RATE-1: grades exist on public recipes only. */
  private assertRatable(recipe: RecipeEntity): void {
    if (recipe.visibility !== 'public') {
      throw new ForbiddenException('Only public recipes can be rated');
    }
  }

  /** RATE-2, RATE-4: average and count read straight from the ratings table. */
  private async aggregate(
    manager: EntityManager,
    recipeId: string,
  ): Promise<{ average: number | null; count: number }> {
    const row = await manager
      .createQueryBuilder(RatingEntity, 'rating')
      .select('COUNT(rating.id)', 'count')
      .addSelect('AVG(rating.stars)', 'average')
      .where('rating.recipeId = :recipeId', { recipeId })
      .getRawOne<RatingAggregateRow>();

    const count = row ? Number(row.count) : 0;
    const average =
      count > 0 && row && row.average !== null
        ? toTwoDecimals(Number(row.average))
        : null;
    return { average, count };
  }
}

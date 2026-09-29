// SPEC §12.1: the nine tables of the schema and their unique constraints, read
// from TypeORM's decorator metadata. No database is touched.

import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import {
  AiDailyUsageEntity,
  CommentEntity,
  CommentVoteEntity,
  ENTITIES,
  FriendRequestEntity,
  RatingEntity,
  RecipeEntity,
  RecipeShareEntity,
  RecipeVersionEntity,
  UserEntity,
} from './index';

/** §12.1: the table list, in the order the schema declares it. */
const SPEC_TABLES = [
  'users',
  'recipes',
  'recipe_versions',
  'recipe_shares',
  'friend_requests',
  'ratings',
  'comments',
  'comment_votes',
  'ai_daily_usage',
];

function tableNameOf(entity: object): string | undefined {
  return getMetadataArgsStorage().tables.find((table) => table.target === entity)
    ?.name;
}

function uniquesOf(
  entity: object,
): { name?: string; columns: string[] }[] {
  return getMetadataArgsStorage()
    .uniques.filter((unique) => unique.target === entity)
    .map((unique) => ({
      name: unique.name,
      columns: Array.isArray(unique.columns) ? [...unique.columns] : [],
    }));
}

function columnOptionsOf(
  entity: object,
  propertyName: string,
): Record<string, unknown> {
  const column = getMetadataArgsStorage().columns.find(
    (candidate) =>
      candidate.target === entity && candidate.propertyName === propertyName,
  );
  return (column?.options ?? {}) as Record<string, unknown>;
}

describe('ENTITIES', () => {
  it('§12.1 registers exactly the nine tables of the schema', () => {
    expect(ENTITIES).toHaveLength(9);
    expect(ENTITIES.map((entity) => tableNameOf(entity))).toEqual(SPEC_TABLES);
  });

  it('§12.1 names every table in snake_case', () => {
    for (const name of SPEC_TABLES) {
      expect(name).toMatch(/^[a-z][a-z_]*$/);
    }
  });

  it('§12.1 lists every entity class explicitly, never a glob', () => {
    expect(
      ENTITIES.every((entity) => typeof entity === 'function'),
    ).toBe(true);
    expect(new Set(ENTITIES).size).toBe(ENTITIES.length);
  });
});

describe('entity unique constraints', () => {
  it('AUTH-5 makes users.username and users.email unique', () => {
    expect(tableNameOf(UserEntity)).toBe('users');
    expect(columnOptionsOf(UserEntity, 'username')['unique']).toBe(true);
    expect(columnOptionsOf(UserEntity, 'email')['unique']).toBe(true);
    expect(columnOptionsOf(UserEntity, 'email')['nullable']).toBe(true);
  });

  it('REC-7 makes a version number unique within its recipe', () => {
    expect(uniquesOf(RecipeVersionEntity)).toEqual([
      {
        name: 'uq_recipe_versions_recipe_version',
        columns: ['recipeId', 'versionNumber'],
      },
    ]);
  });

  it('REC-2 makes the recipe/user pair of a share unique', () => {
    expect(uniquesOf(RecipeShareEntity)).toEqual([
      { name: 'uq_recipe_shares_recipe_user', columns: ['recipeId', 'userId'] },
    ]);
  });

  it('FR-2 makes the from/to pair of a friend request unique', () => {
    expect(uniquesOf(FriendRequestEntity)).toEqual([
      {
        name: 'uq_friend_requests_from_to',
        columns: ['fromUserId', 'toUserId'],
      },
    ]);
  });

  it('RATE-4 allows one rating per user per recipe', () => {
    expect(uniquesOf(RatingEntity)).toEqual([
      { name: 'uq_ratings_recipe_user', columns: ['recipeId', 'userId'] },
    ]);
  });

  it('COM-2 allows one vote per user per comment', () => {
    expect(uniquesOf(CommentVoteEntity)).toEqual([
      {
        name: 'uq_comment_votes_comment_user',
        columns: ['commentId', 'userId'],
      },
    ]);
  });

  it('COOK-8 keeps one AI usage row per user per day', () => {
    expect(uniquesOf(AiDailyUsageEntity)).toEqual([
      { name: 'uq_ai_daily_usage_user_day', columns: ['userId', 'day'] },
    ]);
    expect(columnOptionsOf(AiDailyUsageEntity, 'day')['type']).toBe('date');
    expect(columnOptionsOf(AiDailyUsageEntity, 'count')['default']).toBe(0);
  });
});

describe('entity columns of §12.1', () => {
  it('RATE-2 stores the rating average as numeric(3,2), nullable', () => {
    const options = columnOptionsOf(RecipeEntity, 'ratingAverage');
    expect(options['type']).toBe('numeric');
    expect(options['precision']).toBe(3);
    expect(options['scale']).toBe(2);
    expect(options['nullable']).toBe(true);
    expect(options['transformer']).toBeDefined();
  });

  it('REC-6 keeps a soft-delete column on recipes and comments', () => {
    expect(columnOptionsOf(RecipeEntity, 'deletedAt')['nullable']).toBe(true);
    expect(columnOptionsOf(CommentEntity, 'deletedAt')['nullable']).toBe(true);
  });

  it('§3.1.1 stores ingredients and steps as jsonb on a recipe version', () => {
    expect(columnOptionsOf(RecipeVersionEntity, 'ingredients')['type']).toBe(
      'jsonb',
    );
    expect(columnOptionsOf(RecipeVersionEntity, 'steps')['type']).toBe('jsonb');
  });
});

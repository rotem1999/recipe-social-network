// SPEC §6 COM-1..COM-3. Hand-written fakes only: no database, no network.
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { CommentEntity, RecipeEntity } from '@rsn/api/data-access-db';
import type { RecipeAccessService } from '@rsn/api/feature-recipes';
import type { Visibility } from '@rsn/shared/util-domain';

import { CommentsService } from './comments.service';

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


const RECIPE_ID = '11111111-1111-4111-8111-111111111111';
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

function recipeRow(visibility: Visibility): RecipeEntity {
  return {
    id: RECIPE_ID,
    ownerId: AUTHOR_ID,
    visibility,
    deletedAt: null,
  } as RecipeEntity;
}

function commentRow(
  id: string,
  createdAt: string,
  username = 'mika',
  userId = AUTHOR_ID,
): CommentEntity {
  return {
    id,
    recipeId: RECIPE_ID,
    userId,
    body: `body of ${id}`,
    deletedAt: null,
    createdAt: new Date(createdAt),
    user: { username },
  } as CommentEntity;
}

/** The chained query builder `pointsFor` uses (COM-2). */
interface VoteSumBuilderFake {
  select: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  groupBy: jest.Mock;
  getRawMany: jest.Mock;
}

interface Harness {
  service: CommentsService;
  comments: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  votes: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  access: { loadOrThrow: jest.Mock; assertCanView: jest.Mock };
  setVoteSums: (rows: { commentId: string; points: string }[]) => void;
  voteSumCalls: number;
}

function makeHarness(recipe: RecipeEntity): Harness {
  let voteSums: { commentId: string; points: string }[] = [];
  const state = { voteSumCalls: 0 };

  const comments = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => ({ ...(entity as object) })),
  };

  const votes = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (entity: unknown) => entity),
    remove: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((entity: unknown) => ({ ...(entity as object) })),
    createQueryBuilder: jest.fn(() => {
      state.voteSumCalls += 1;
      const builder: VoteSumBuilderFake = {
        select: jest.fn(() => builder),
        addSelect: jest.fn(() => builder),
        where: jest.fn(() => builder),
        groupBy: jest.fn(() => builder),
        getRawMany: jest.fn(async () => voteSums),
      };
      return builder;
    }),
  };

  const access = {
    loadOrThrow: jest.fn().mockResolvedValue(recipe),
    assertCanView: jest.fn().mockResolvedValue(undefined),
  };

  const service = new CommentsService(
    comments as never,
    votes as never,
    access as unknown as RecipeAccessService,
  );

  return {
    service,
    comments,
    votes,
    access,
    setVoteSums: (rows) => {
      voteSums = rows;
    },
    get voteSumCalls(): number {
      return state.voteSumCalls;
    },
  } as Harness;
}

describe('CommentsService.list and create (COM-1, COM-2, COM-3)', () => {
  it('COM-1 refuses the comment section of a private recipe even for its owner', async () => {
    const harness = makeHarness(recipeRow('private'));

    await expect(harness.service.list(AUTHOR_ID, RECIPE_ID)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(harness.service.list(AUTHOR_ID, RECIPE_ID)).rejects.toThrow(
      'Private recipes have no comment section',
    );
    expect(harness.access.loadOrThrow).toHaveBeenCalledWith(RECIPE_ID);
  });

  it('COM-1 refuses writing a comment on a private recipe even for its owner', async () => {
    const harness = makeHarness(recipeRow('private'));

    await expect(
      harness.service.create(AUTHOR_ID, 'mika', RECIPE_ID, 'nice'),
    ).rejects.toThrow('Private recipes have no comment section');
    expect(harness.comments.save).not.toHaveBeenCalled();
  });

  it('COM-1 refuses a caller who cannot see the recipe', async () => {
    const harness = makeHarness(recipeRow('shared'));
    harness.access.assertCanView.mockRejectedValue(
      new ForbiddenException('You cannot view this recipe'),
    );

    await expect(harness.service.list(OTHER_ID, RECIPE_ID)).rejects.toThrow(
      'You cannot view this recipe',
    );
  });

  it('COM-2 returns votesEnabled false and zero points on a shared recipe', async () => {
    const harness = makeHarness(recipeRow('shared'));
    harness.comments.find.mockResolvedValue([
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    ]);
    harness.setVoteSums([{ commentId: 'c1', points: '7' }]);

    const response = await harness.service.list(AUTHOR_ID, RECIPE_ID);

    expect(response.votesEnabled).toBe(false);
    expect(response.comments).toHaveLength(1);
    expect(response.comments[0].points).toBe(0);
    expect(response.comments[0].myVote).toBe(0);
    // No vote query is made at all on a shared recipe.
    expect(harness.voteSumCalls).toBe(0);
    expect(harness.votes.find).not.toHaveBeenCalled();
  });

  it('COM-2 returns votesEnabled true with summed points on a public recipe', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.find.mockResolvedValue([
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    ]);
    harness.setVoteSums([{ commentId: 'c1', points: '7' }]);
    harness.votes.find.mockResolvedValue([{ commentId: 'c1', value: -1 }]);

    const response = await harness.service.list(OTHER_ID, RECIPE_ID);

    expect(response.votesEnabled).toBe(true);
    expect(response.comments[0].points).toBe(7);
    expect(response.comments[0].myVote).toBe(-1);
  });

  it('COM-3 orders comments by points, then newest first', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.find.mockResolvedValue([
      commentRow('old-2pts', '2026-09-01T10:00:00.000Z'),
      commentRow('new-2pts', '2026-09-05T10:00:00.000Z'),
      commentRow('top-9pts', '2026-08-01T10:00:00.000Z'),
      commentRow('zero', '2026-09-09T10:00:00.000Z'),
    ]);
    harness.setVoteSums([
      { commentId: 'old-2pts', points: '2' },
      { commentId: 'new-2pts', points: '2' },
      { commentId: 'top-9pts', points: '9' },
    ]);

    const response = await harness.service.list(OTHER_ID, RECIPE_ID);

    expect(response.comments.map((comment) => comment.id)).toEqual([
      'top-9pts',
      'new-2pts',
      'old-2pts',
      'zero',
    ]);
  });

  it('COM-3 excludes soft-deleted comments from the list', async () => {
    const harness = makeHarness(recipeRow('public'));

    await harness.service.list(OTHER_ID, RECIPE_ID);

    expect(harness.comments.find).toHaveBeenCalledWith({
      where: { recipeId: RECIPE_ID, deletedAt: IsNull() },
      relations: { user: true },
    });
  });

  it('COM-3 returns the author username and creation time of every comment', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.find.mockResolvedValue([
      commentRow('c1', '2026-09-01T10:00:00.000Z', 'rotem'),
    ]);

    const response = await harness.service.list(OTHER_ID, RECIPE_ID);

    expect(response.comments[0]).toEqual({
      id: 'c1',
      recipeId: RECIPE_ID,
      authorId: AUTHOR_ID,
      authorUsername: 'rotem',
      body: 'body of c1',
      points: 0,
      myVote: 0,
      createdAt: '2026-09-01T10:00:00.000Z',
    });
  });

  it('COM-3 stores a new comment on a shared recipe with zero points', async () => {
    const harness = makeHarness(recipeRow('shared'));
    harness.comments.save.mockResolvedValue(
      commentRow('new-1', '2026-09-20T08:00:00.000Z', 'rotem'),
    );

    const dto = await harness.service.create(
      AUTHOR_ID,
      'rotem',
      RECIPE_ID,
      'looks great',
    );

    expect(harness.comments.create).toHaveBeenCalledWith({
      recipeId: RECIPE_ID,
      userId: AUTHOR_ID,
      body: 'looks great',
      deletedAt: null,
    });
    expect(dto.points).toBe(0);
    expect(dto.myVote).toBe(0);
    expect(dto.authorUsername).toBe('rotem');
  });
});

describe('CommentsService.remove (COM-3)', () => {
  it('COM-3 refuses a delete by anyone but the author with 403', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z', 'mika', AUTHOR_ID),
    );

    await expect(harness.service.remove(OTHER_ID, 'c1')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(harness.service.remove(OTHER_ID, 'c1')).rejects.toThrow(
      'Only the author can delete this comment',
    );
    expect(harness.comments.save).not.toHaveBeenCalled();
  });

  it('COM-3 lets the author soft-delete their own comment', async () => {
    const harness = makeHarness(recipeRow('public'));
    const row = commentRow('c1', '2026-09-01T10:00:00.000Z', 'mika', AUTHOR_ID);
    harness.comments.findOne.mockResolvedValue(row);

    await harness.service.remove(AUTHOR_ID, 'c1');

    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(harness.comments.save).toHaveBeenCalledWith(row);
  });

  it('COM-3 reports 404 for a comment that is absent or already deleted', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(null);

    await expect(harness.service.remove(AUTHOR_ID, 'gone')).rejects.toThrow(
      NotFoundException,
    );
    expect(harness.comments.findOne).toHaveBeenCalledWith({
      where: { id: 'gone', deletedAt: IsNull() },
      relations: { user: true },
    });
  });
});

describe('CommentsService.vote (COM-2, COM-3)', () => {
  it('COM-2 refuses a vote on a shared recipe with 403', async () => {
    const harness = makeHarness(recipeRow('shared'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );

    await expect(harness.service.vote(OTHER_ID, 'c1', 1)).rejects.toThrow(
      'Comment votes exist on public recipes only',
    );
    expect(harness.votes.save).not.toHaveBeenCalled();
  });

  it('COM-3 removes the stored row when the value is 0', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );
    const existing = { id: 'v1', commentId: 'c1', userId: OTHER_ID, value: 1 };
    harness.votes.findOne.mockResolvedValue(existing);
    harness.setVoteSums([]);

    const dto = await harness.service.vote(OTHER_ID, 'c1', 0);

    expect(harness.votes.remove).toHaveBeenCalledWith(existing);
    expect(harness.votes.save).not.toHaveBeenCalled();
    expect(dto.myVote).toBe(0);
    expect(dto.points).toBe(0);
  });

  it('COM-3 writes nothing when a 0 vote finds no stored row', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );
    harness.votes.findOne.mockResolvedValue(null);

    await harness.service.vote(OTHER_ID, 'c1', 0);

    expect(harness.votes.remove).not.toHaveBeenCalled();
    expect(harness.votes.save).not.toHaveBeenCalled();
  });

  it('COM-2 replaces an existing vote instead of adding a second one', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );
    const existing = { id: 'v1', commentId: 'c1', userId: OTHER_ID, value: 1 };
    harness.votes.findOne.mockResolvedValue(existing);
    harness.setVoteSums([{ commentId: 'c1', points: '-1' }]);

    const dto = await harness.service.vote(OTHER_ID, 'c1', -1);

    expect(harness.votes.create).not.toHaveBeenCalled();
    expect(harness.votes.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'v1', value: -1 }),
    );
    expect(dto.points).toBe(-1);
    expect(dto.myVote).toBe(-1);
  });

  it('COM-2 stores a first vote and returns the recomputed points', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );
    harness.votes.findOne.mockResolvedValue(null);
    harness.setVoteSums([{ commentId: 'c1', points: '3' }]);

    const dto = await harness.service.vote(OTHER_ID, 'c1', 1);

    expect(harness.votes.create).toHaveBeenCalledWith({
      commentId: 'c1',
      userId: OTHER_ID,
      value: 1,
    });
    expect(dto.points).toBe(3);
    expect(dto.myVote).toBe(1);
  });

  it('COM-3 refuses a vote from a caller who cannot see the recipe', async () => {
    const harness = makeHarness(recipeRow('public'));
    harness.comments.findOne.mockResolvedValue(
      commentRow('c1', '2026-09-01T10:00:00.000Z'),
    );
    harness.access.assertCanView.mockRejectedValue(
      new ForbiddenException('You cannot view this recipe'),
    );

    await expect(harness.service.vote(OTHER_ID, 'c1', 1)).rejects.toThrow(
      'You cannot view this recipe',
    );
    expect(harness.votes.save).not.toHaveBeenCalled();
  });
});

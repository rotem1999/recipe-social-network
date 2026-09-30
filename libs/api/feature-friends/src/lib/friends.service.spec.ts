// §4 (FR-1..FR-4): mutual friendship, pending requests, removal and user search.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import type {
  FriendRequestEntity,
  FriendRequestStatus,
  RecipeShareEntity,
  UserEntity,
} from '@rsn/api/data-access-db';
import type { UsersService } from '@rsn/api/feature-auth';
import { FriendsService } from './friends.service';

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


const ME = 'user-me';
const OTHER = 'user-other';
const AT = new Date('2026-09-28T10:00:00.000Z');

function requestRow(
  overrides: Partial<FriendRequestEntity> = {},
): FriendRequestEntity {
  return {
    id: 'req-1',
    fromUserId: ME,
    toUserId: OTHER,
    status: 'pending' as FriendRequestStatus,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  } as FriendRequestEntity;
}

function userRow(id: string, username: string): UserEntity {
  return {
    id,
    username,
    email: null,
    passwordHash: 'scrypt$131072$8$1$c2FsdA==$a2V5',
    favouriteCategories: [],
    createdAt: AT,
    updatedAt: AT,
  } as UserEntity;
}

interface ShareQueryBuilderFake {
  innerJoin: jest.Mock;
  where: jest.Mock;
  select: jest.Mock;
  getRawMany: jest.Mock;
}

interface Harness {
  service: FriendsService;
  requests: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  shares: { createQueryBuilder: jest.Mock; delete: jest.Mock };
  shareBuilder: ShareQueryBuilderFake;
  users: { findById: jest.Mock; findByIds: jest.Mock; search: jest.Mock };
  /**
   * FR-4: `requests.manager.transaction` fake. The callback gets `tx.manager`, whose
   * `withRepository` hands out transaction-scoped repositories (`tx.requests`,
   * `tx.shares`), and `tx.log` records every write with whether a transaction was open.
   */
  tx: {
    transaction: jest.Mock;
    manager: { withRepository: jest.Mock; query: jest.Mock };
    requests: { delete: jest.Mock };
    shares: { createQueryBuilder: jest.Mock; delete: jest.Mock };
    log: string[];
  };
}

function harness(): Harness {
  const shareBuilder: Partial<ShareQueryBuilderFake> = {};
  shareBuilder.innerJoin = jest.fn(() => shareBuilder);
  shareBuilder.where = jest.fn(() => shareBuilder);
  shareBuilder.select = jest.fn(() => shareBuilder);
  shareBuilder.getRawMany = jest.fn().mockResolvedValue([]);

  const requests = {
    // Every mutation ends with getFriends(), whose find() is left with the default [].
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(
      (input: Partial<FriendRequestEntity>) => input as FriendRequestEntity,
    ),
    save: jest.fn((row: FriendRequestEntity) => Promise.resolve(row)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const shares = {
    createQueryBuilder: jest.fn(() => shareBuilder as ShareQueryBuilderFake),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const users = {
    findById: jest.fn().mockResolvedValue(userRow(OTHER, 'other')),
    findByIds: jest.fn().mockResolvedValue([]),
    search: jest.fn().mockResolvedValue([]),
  };

  const log: string[] = [];
  let open = false;
  const record = (label: string) => log.push(open ? `tx:${label}` : label);
  const txRequests = {
    delete: jest.fn(() => {
      record('requests.delete');
      return Promise.resolve({ affected: 1 });
    }),
  };
  const txShares = {
    createQueryBuilder: jest.fn(() => shareBuilder as ShareQueryBuilderFake),
    delete: jest.fn(() => {
      record('shares.delete');
      return Promise.resolve({ affected: 0 });
    }),
  };
  const manager = {
    withRepository: jest.fn((repository: unknown) => {
      if (repository === requests) return txRequests;
      if (repository === shares) return txShares;
      throw new Error('withRepository called with an unknown repository');
    }),
    query: jest.fn(() => {
      record('query');
      return Promise.resolve([]);
    }),
  };
  const transaction = jest.fn(
    async (work: (entityManager: typeof manager) => Promise<unknown>) => {
      log.push('begin');
      open = true;
      try {
        const result = await work(manager);
        log.push('commit');
        return result;
      } catch (error) {
        log.push('rollback');
        throw error;
      } finally {
        open = false;
      }
    },
  );
  Object.assign(requests, { manager: { transaction } });

  const service = new FriendsService(
    requests as unknown as Repository<FriendRequestEntity>,
    shares as unknown as Repository<RecipeShareEntity>,
    users as unknown as UsersService,
  );
  return {
    service,
    requests,
    shares,
    shareBuilder: shareBuilder as ShareQueryBuilderFake,
    users,
    tx: { transaction, manager, requests: txRequests, shares: txShares, log },
  };
}

describe('FriendsService', () => {
  describe('FR-1 areFriends and friendIdsOf', () => {
    it('FR-1 counts an accepted row in either direction as a friendship', async () => {
      const { service, requests } = harness();
      requests.count.mockResolvedValue(1);

      await expect(service.areFriends(ME, OTHER)).resolves.toBe(true);

      expect(requests.count).toHaveBeenCalledWith({
        where: [
          { fromUserId: ME, toUserId: OTHER, status: 'accepted' },
          { fromUserId: OTHER, toUserId: ME, status: 'accepted' },
        ],
      });
    });

    it('FR-1 says a user is never their own friend', async () => {
      const { service, requests } = harness();

      await expect(service.areFriends(ME, ME)).resolves.toBe(false);

      expect(requests.count).not.toHaveBeenCalled();
    });

    it('FR-1 reads the other side of every accepted row', async () => {
      const { service, requests } = harness();
      requests.find.mockResolvedValue([
        requestRow({ id: 'a', fromUserId: ME, toUserId: 'f1', status: 'accepted' }),
        requestRow({ id: 'b', fromUserId: 'f2', toUserId: ME, status: 'accepted' }),
      ]);

      await expect(service.friendIdsOf(ME)).resolves.toEqual(['f1', 'f2']);
    });
  });

  describe('FR-2, FR-4 getFriends', () => {
    it('FR-2 splits the rows into friends, incoming and outgoing', async () => {
      const { service, requests, users } = harness();
      requests.find.mockResolvedValue([
        requestRow({ id: 'f', fromUserId: 'friend', toUserId: ME, status: 'accepted' }),
        requestRow({ id: 'i', fromUserId: 'asker', toUserId: ME, status: 'pending' }),
        requestRow({ id: 'o', fromUserId: ME, toUserId: 'asked', status: 'pending' }),
        requestRow({ id: 'd', fromUserId: ME, toUserId: 'declined', status: 'declined' }),
      ]);
      users.findByIds.mockResolvedValue([
        userRow(ME, 'me'),
        userRow('friend', 'friend'),
        userRow('asker', 'asker'),
        userRow('asked', 'asked'),
      ]);

      const result = await service.getFriends(ME);

      expect(result.friends).toEqual([
        { userId: 'friend', username: 'friend', since: AT.toISOString() },
      ]);
      expect(result.incoming).toEqual([
        {
          id: 'i',
          fromUserId: 'asker',
          fromUsername: 'asker',
          toUserId: ME,
          toUsername: 'me',
          createdAt: AT.toISOString(),
        },
      ]);
      expect(result.outgoing).toEqual([
        {
          id: 'o',
          fromUserId: ME,
          fromUsername: 'me',
          toUserId: 'asked',
          toUsername: 'asked',
          createdAt: AT.toISOString(),
        },
      ]);
      // FR-4: a declined row is neither a friendship nor a pending request.
      expect(JSON.stringify(result)).not.toContain('declined');
    });
  });

  describe('FR-2 sendRequest', () => {
    it('FR-2 answers 400 for a request to yourself', async () => {
      const { service, requests } = harness();

      await expect(service.sendRequest(ME, ME)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendRequest(ME, ME)).rejects.toThrow(
        'You cannot send a friend request to yourself',
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-2 answers 404 for an unknown target', async () => {
      const { service, users, requests } = harness();
      users.findById.mockResolvedValue(null);

      await expect(service.sendRequest(ME, 'ghost')).rejects.toThrow(
        NotFoundException,
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-2 stores a pending row when there is nothing between the two', async () => {
      const { service, requests } = harness();

      await service.sendRequest(ME, OTHER);

      expect(requests.create).toHaveBeenCalledWith({
        fromUserId: ME,
        toUserId: OTHER,
        status: 'pending',
      });
      expect(requests.save).toHaveBeenCalledWith({
        fromUserId: ME,
        toUserId: OTHER,
        status: 'pending',
      });
    });

    it('FR-2 answers 409 when a request in the same direction is already pending', async () => {
      const { service, requests } = harness();
      requests.find.mockResolvedValueOnce([requestRow({ status: 'pending' })]);

      await expect(service.sendRequest(ME, OTHER)).rejects.toThrow(
        ConflictException,
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-2 answers 409 when the two are already friends', async () => {
      const { service, requests } = harness();
      requests.find.mockResolvedValueOnce([requestRow({ status: 'accepted' })]);

      await expect(service.sendRequest(ME, OTHER)).rejects.toThrow(
        'You are already friends with this user',
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-2 accepts the incoming pending request instead of creating a second row', async () => {
      const { service, requests } = harness();
      const incoming = requestRow({
        id: 'req-incoming',
        fromUserId: OTHER,
        toUserId: ME,
        status: 'pending',
      });
      requests.find.mockResolvedValueOnce([incoming]);

      await service.sendRequest(ME, OTHER);

      expect(requests.create).not.toHaveBeenCalled();
      expect(requests.save).toHaveBeenCalledTimes(1);
      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-incoming', status: 'accepted' }),
      );
    });

    it('FR-2 reuses a declined row in the same direction rather than breaking the unique pair', async () => {
      const { service, requests } = harness();
      const declined = requestRow({ id: 'req-declined', status: 'declined' });
      requests.find.mockResolvedValueOnce([declined]);

      await service.sendRequest(ME, OTHER);

      expect(requests.create).not.toHaveBeenCalled();
      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-declined', status: 'pending' }),
      );
    });

    it('FR-4 lets the sender request again at once after the receiver cancels (declines)', async () => {
      const { service, requests } = harness();
      const row = requestRow({ id: 'req-1', fromUserId: OTHER, toUserId: ME });
      requests.findOne.mockResolvedValue(row);

      await service.cancel(ME, 'req-1');
      expect(row.status).toBe('declined');

      requests.save.mockClear();
      requests.find.mockResolvedValueOnce([row]);
      await service.sendRequest(OTHER, ME);

      expect(requests.create).not.toHaveBeenCalled();
      expect(requests.save).toHaveBeenCalledTimes(1);
      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'req-1',
          fromUserId: OTHER,
          toUserId: ME,
          status: 'pending',
        }),
      );
    });

    it('FR-4 lets the receiver send a request of their own at once after declining', async () => {
      const { service, requests } = harness();
      const declined = requestRow({
        id: 'req-declined',
        fromUserId: OTHER,
        toUserId: ME,
        status: 'declined',
      });
      requests.find.mockResolvedValueOnce([declined]);

      await service.sendRequest(ME, OTHER);

      // The declined row belongs to the other direction, so a new pending row is created.
      expect(requests.create).toHaveBeenCalledWith({
        fromUserId: ME,
        toUserId: OTHER,
        status: 'pending',
      });
      expect(requests.save).toHaveBeenCalledTimes(1);
      expect(declined.status).toBe('declined');
    });

    it.each([
      ['the sender', ME, OTHER],
      ['the receiver', OTHER, ME],
    ])(
      'FR-4 lets %s request again at once after the sender cancelled',
      async (_who, from, to) => {
        const { service, requests, users } = harness();
        requests.findOne.mockResolvedValue(
          requestRow({ id: 'req-1', fromUserId: ME, toUserId: OTHER }),
        );
        await service.cancel(ME, 'req-1');
        expect(requests.delete).toHaveBeenCalledWith('req-1');

        // The cancelled row is gone, so nothing lies between the two.
        users.findById.mockResolvedValue(userRow(to, 'target'));
        requests.find.mockResolvedValueOnce([]);
        await service.sendRequest(from, to);

        expect(requests.create).toHaveBeenCalledWith({
          fromUserId: from,
          toUserId: to,
          status: 'pending',
        });
        expect(requests.save).toHaveBeenCalledWith({
          fromUserId: from,
          toUserId: to,
          status: 'pending',
        });
      },
    );
  });

  describe('FR-2, FR-4 accept, decline and cancel', () => {
    it('FR-2 accepts a pending request for its receiver', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: OTHER, toUserId: ME }),
      );

      await service.accept(ME, 'req-1');

      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1', status: 'accepted' }),
      );
    });

    it('FR-2 answers 403 when the sender tries to accept their own request', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: ME, toUserId: OTHER }),
      );

      await expect(service.accept(ME, 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.accept(ME, 'req-1')).rejects.toThrow(
        'Only the receiver can accept this request',
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-4 declines a pending request for its receiver only', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: OTHER, toUserId: ME }),
      );

      await service.decline(ME, 'req-1');
      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'declined' }),
      );

      requests.save.mockClear();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: ME, toUserId: OTHER }),
      );
      await expect(service.decline(ME, 'req-1')).rejects.toThrow(
        'Only the receiver can decline this request',
      );
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-4 lets the sender cancel a pending request, which deletes the row', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: ME, toUserId: OTHER }),
      );

      await service.cancel(ME, 'req-1');

      expect(requests.delete).toHaveBeenCalledWith('req-1');
    });

    it('FR-4 returns the caller FriendsResponse after the sender cancels', async () => {
      const { service, requests, users } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: ME, toUserId: OTHER }),
      );
      // After the delete, getFriends() reads what is left for the caller.
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'f', fromUserId: 'friend', toUserId: ME, status: 'accepted' }),
      ]);
      users.findByIds.mockResolvedValue([
        userRow(ME, 'me'),
        userRow('friend', 'friend'),
      ]);

      const result = await service.cancel(ME, 'req-1');

      expect(result).toEqual({
        friends: [{ userId: 'friend', username: 'friend', since: AT.toISOString() }],
        incoming: [],
        outgoing: [],
      });
      expect(requests.save).not.toHaveBeenCalled();
    });

    it('FR-4 lets the receiver cancel a pending request, with the same effect as declining', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: OTHER, toUserId: ME }),
      );

      const result = await service.cancel(ME, 'req-1');

      expect(requests.save).toHaveBeenCalledTimes(1);
      expect(requests.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'req-1',
          fromUserId: OTHER,
          toUserId: ME,
          status: 'declined',
        }),
      );
      // Declining keeps the row; only the sender's cancel deletes it.
      expect(requests.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ friends: [], incoming: [], outgoing: [] });
    });

    it('FR-4 leaves the same row behind for a receiver cancel as for a decline', async () => {
      const cancelled = harness();
      const cancelledRow = requestRow({ fromUserId: OTHER, toUserId: ME });
      cancelled.requests.findOne.mockResolvedValue(cancelledRow);
      const declined = harness();
      const declinedRow = requestRow({ fromUserId: OTHER, toUserId: ME });
      declined.requests.findOne.mockResolvedValue(declinedRow);

      await cancelled.service.cancel(ME, 'req-1');
      await declined.service.decline(ME, 'req-1');

      expect(cancelledRow).toEqual(declinedRow);
      expect(cancelled.requests.delete).not.toHaveBeenCalled();
      expect(declined.requests.delete).not.toHaveBeenCalled();
    });

    it('FR-4 answers 403 when a third party tries to cancel, changing nothing', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(
        requestRow({ fromUserId: OTHER, toUserId: 'user-third' }),
      );

      await expect(service.cancel(ME, 'req-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.cancel(ME, 'req-1')).rejects.toThrow(
        'Only the sender or the receiver can cancel this request',
      );
      expect(requests.save).not.toHaveBeenCalled();
      expect(requests.delete).not.toHaveBeenCalled();
    });

    it.each(['accepted', 'declined'] as const)(
      'FR-4 answers 409 when cancelling a request that is no longer pending (%s)',
      async (status) => {
        const { service, requests } = harness();
        requests.findOne.mockResolvedValue(
          requestRow({ fromUserId: OTHER, toUserId: ME, status }),
        );

        await expect(service.cancel(ME, 'req-1')).rejects.toThrow(
          ConflictException,
        );
        expect(requests.save).not.toHaveBeenCalled();
        expect(requests.delete).not.toHaveBeenCalled();
      },
    );

    it('FR-4 answers 404 when cancelling an unknown request id', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(null);

      await expect(service.cancel(ME, 'nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(requests.delete).not.toHaveBeenCalled();
    });

    it('FR-4 answers 404 for an unknown request id', async () => {
      const { service, requests } = harness();
      requests.findOne.mockResolvedValue(null);

      await expect(service.accept(ME, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each(['accepted', 'declined'] as const)(
      'FR-4 answers 409 when the request is no longer pending (%s)',
      async (status) => {
        const { service, requests } = harness();
        requests.findOne.mockResolvedValue(
          requestRow({ fromUserId: OTHER, toUserId: ME, status }),
        );

        await expect(service.accept(ME, 'req-1')).rejects.toThrow(
          'This friend request is no longer pending',
        );
      },
    );
  });

  describe('FR-4 remove', () => {
    it('FR-4 deletes the accepted rows in both directions and every share between the pair', async () => {
      const { service, requests, shares, shareBuilder, tx } = harness();
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'acc-1', fromUserId: ME, toUserId: OTHER, status: 'accepted' }),
        requestRow({ id: 'acc-2', fromUserId: OTHER, toUserId: ME, status: 'accepted' }),
        requestRow({ id: 'dec-1', fromUserId: ME, toUserId: OTHER, status: 'declined' }),
      ]);
      shareBuilder.getRawMany.mockResolvedValue([
        { shareId: 'share-1' },
        { shareId: 'share-2' },
      ]);

      await service.remove(ME, OTHER);

      expect(shareBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('recipe.ownerId = :userId AND share.userId = :otherUserId'),
        { userId: ME, otherUserId: OTHER },
      );
      // Both deletes go through the transaction's repositories, not the injected ones.
      expect(tx.shares.createQueryBuilder).toHaveBeenCalledWith('share');
      expect(tx.shares.delete).toHaveBeenCalledWith(['share-1', 'share-2']);
      expect(tx.requests.delete).toHaveBeenCalledWith(['acc-1', 'acc-2']);
      expect(shares.createQueryBuilder).not.toHaveBeenCalled();
      expect(shares.delete).not.toHaveBeenCalled();
      expect(requests.delete).not.toHaveBeenCalled();
    });

    it('FR-4 leaves the share table alone when the pair shared nothing', async () => {
      const { service, requests, shares, tx } = harness();
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'acc-1', status: 'accepted' }),
      ]);

      await service.remove(ME, OTHER);

      expect(tx.shares.delete).not.toHaveBeenCalled();
      expect(shares.delete).not.toHaveBeenCalled();
      expect(tx.requests.delete).toHaveBeenCalledWith(['acc-1']);
    });

    it('FR-4 makes a shared recipe of either user left with no recipients private', async () => {
      const { service, requests, tx } = harness();
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'acc-1', status: 'accepted' }),
      ]);

      await service.remove(ME, OTHER);

      expect(tx.manager.query).toHaveBeenCalledTimes(1);
      const [sql, parameters] = tx.manager.query.mock.calls[0] as unknown as [
        string,
        unknown[],
      ];
      const statement = sql.replace(/\s+/g, ' ').trim();
      expect(statement).toMatch(/^UPDATE "recipes" SET "visibility" = 'private'/);
      expect(statement).toContain('"updated_at" = now()');
      expect(statement).toContain('"owner_id" = ANY($1::uuid[])');
      expect(statement).toContain(`"visibility" = 'shared'`);
      expect(statement).toContain(
        'NOT EXISTS ( SELECT 1 FROM "recipe_shares" s WHERE s."recipe_id" = "recipes"."id" )',
      );
      // Both users' recipes: the removal can empty the recipient list on either side.
      expect(parameters).toEqual([[ME, OTHER]]);
    });

    it('FR-4 deletes the shares, privatises and deletes the friendship in one transaction, in that order', async () => {
      const { service, requests, shareBuilder, tx } = harness();
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'acc-1', status: 'accepted' }),
      ]);
      shareBuilder.getRawMany.mockResolvedValue([{ shareId: 'share-1' }]);

      await service.remove(ME, OTHER);

      expect(tx.transaction).toHaveBeenCalledTimes(1);
      expect(tx.log).toEqual([
        'begin',
        'tx:shares.delete',
        'tx:query',
        'tx:requests.delete',
        'commit',
      ]);
    });

    it('FR-4 fails the removal and keeps the friendship when the privatise step fails', async () => {
      const { service, requests, tx } = harness();
      requests.find.mockResolvedValueOnce([
        requestRow({ id: 'acc-1', status: 'accepted' }),
      ]);
      tx.manager.query.mockRejectedValueOnce(new Error('update failed'));

      await expect(service.remove(ME, OTHER)).rejects.toThrow('update failed');

      expect(tx.requests.delete).not.toHaveBeenCalled();
      expect(requests.delete).not.toHaveBeenCalled();
      expect(tx.log).toEqual(['begin', 'rollback']);
    });

    it('FR-4 answers 404 when the two are not friends', async () => {
      const { service, requests, shares, tx } = harness();
      requests.find.mockResolvedValueOnce([requestRow({ status: 'pending' })]);

      await expect(service.remove(ME, OTHER)).rejects.toThrow(
        NotFoundException,
      );
      expect(shares.delete).not.toHaveBeenCalled();
      expect(requests.delete).not.toHaveBeenCalled();
      expect(tx.transaction).not.toHaveBeenCalled();
      expect(tx.manager.query).not.toHaveBeenCalled();
    });

    it('FR-4 answers 400 for removing yourself', async () => {
      const { service, requests, tx } = harness();

      await expect(service.remove(ME, ME)).rejects.toThrow(
        BadRequestException,
      );
      expect(requests.find).not.toHaveBeenCalled();
      expect(tx.transaction).not.toHaveBeenCalled();
    });
  });

  describe('FR-3, FR-4 search', () => {
    it('FR-4 asks for at most 10 users and marks self, friends and pending requests', async () => {
      const { service, requests, users } = harness();
      users.search.mockResolvedValue([
        userRow(ME, 'me'),
        userRow('friend', 'friendly'),
        userRow('asked', 'asked'),
        userRow('stranger', 'stranger'),
      ]);
      requests.find.mockResolvedValue([
        requestRow({ id: 'acc', fromUserId: ME, toUserId: 'friend', status: 'accepted' }),
        requestRow({ id: 'pen', fromUserId: ME, toUserId: 'asked', status: 'pending' }),
      ]);

      const result = await service.search(ME, ' fri ');

      expect(users.search).toHaveBeenCalledWith('fri', 10);
      expect(result.users).toEqual([
        // FR-4: the caller's own row is marked `isSelf` only; it does not inherit the
        // flags of the caller's requests with third parties.
        {
          id: ME,
          username: 'me',
          isSelf: true,
          isFriend: false,
          pendingRequestId: null,
        },
        {
          id: 'friend',
          username: 'friendly',
          isSelf: false,
          isFriend: true,
          pendingRequestId: null,
        },
        {
          id: 'asked',
          username: 'asked',
          isSelf: false,
          isFriend: false,
          pendingRequestId: 'pen',
        },
        {
          id: 'stranger',
          username: 'stranger',
          isSelf: false,
          isFriend: false,
          pendingRequestId: null,
        },
      ]);
    });

    it('FR-4 marks a stranger as neither a friend nor pending even when the caller has other relationships', async () => {
      const { service, requests, users } = harness();
      users.search.mockResolvedValue([userRow('stranger', 'stranger')]);
      requests.find.mockResolvedValue([
        requestRow({ id: 'acc', fromUserId: ME, toUserId: 'friend', status: 'accepted' }),
        requestRow({ id: 'pen', fromUserId: ME, toUserId: 'asked', status: 'pending' }),
      ]);

      const result = await service.search(ME, 'str');

      expect(result.users).toEqual([
        {
          id: 'stranger',
          username: 'stranger',
          isSelf: false,
          isFriend: false,
          pendingRequestId: null,
        },
      ]);
    });

    it('FR-4 reports an incoming pending request by id as well', async () => {
      const { service, requests, users } = harness();
      users.search.mockResolvedValue([userRow('asker', 'asker')]);
      requests.find.mockResolvedValue([
        requestRow({ id: 'in', fromUserId: 'asker', toUserId: ME, status: 'pending' }),
      ]);

      const result = await service.search(ME, 'ask');

      expect(result.users[0].pendingRequestId).toBe('in');
    });

    it('FR-4 returns nothing for a blank query without touching the database', async () => {
      const { service, users, requests } = harness();

      await expect(service.search(ME, '   ')).resolves.toEqual({ users: [] });

      expect(users.search).not.toHaveBeenCalled();
      expect(requests.find).not.toHaveBeenCalled();
    });

    it('FR-4 skips the friend-request query when nothing matched', async () => {
      const { service, users, requests } = harness();
      users.search.mockResolvedValue([]);

      await expect(service.search(ME, 'zzz')).resolves.toEqual({ users: [] });

      expect(requests.find).not.toHaveBeenCalled();
    });
  });
});

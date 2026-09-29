import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  FriendRequestEntity,
  RecipeEntity,
  RecipeShareEntity,
} from '@rsn/api/data-access-db';
import { UsersService } from '@rsn/api/feature-auth';
import type {
  FriendDto,
  FriendRequestDto,
  FriendsResponse,
  UserSearchResponse,
  UserSearchResultDto,
} from '@rsn/shared/util-contracts';

/** FR-4: `GET /users/search?q=` returns at most 10 users. */
const USER_SEARCH_LIMIT = 10;

/**
 * §4 (FR-1..FR-4): mutual friendship on the `friend_requests` table (§12.1). A friendship is
 * an `accepted` row in either direction; a request is `pending` until the receiver acts.
 */
@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(FriendRequestEntity)
    private readonly requests: Repository<FriendRequestEntity>,
    @InjectRepository(RecipeShareEntity)
    private readonly shares: Repository<RecipeShareEntity>,
    private readonly users: UsersService,
  ) {}

  /** FR-1: used by feature-recipes to decide whether a share is allowed. */
  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) {
      return false;
    }
    const count = await this.requests.count({
      where: [
        { fromUserId: a, toUserId: b, status: 'accepted' },
        { fromUserId: b, toUserId: a, status: 'accepted' },
      ],
    });
    return count > 0;
  }

  /** FR-1: the ids of every accepted friend of `userId`, in request order. */
  async friendIdsOf(userId: string): Promise<string[]> {
    const rows = await this.acceptedRowsOf(userId);
    return rows.map((row) =>
      row.fromUserId === userId ? row.toUserId : row.fromUserId,
    );
  }

  /** §11.6 `GET /friends`: friends, incoming and outgoing pending requests. */
  async getFriends(userId: string): Promise<FriendsResponse> {
    const rows = await this.requests.find({
      where: [{ fromUserId: userId }, { toUserId: userId }],
      order: { createdAt: 'ASC' },
    });
    const accepted = rows.filter((row) => row.status === 'accepted');
    const incoming = rows.filter(
      (row) => row.status === 'pending' && row.toUserId === userId,
    );
    const outgoing = rows.filter(
      (row) => row.status === 'pending' && row.fromUserId === userId,
    );

    const ids = new Set<string>([userId]);
    for (const row of [...accepted, ...incoming, ...outgoing]) {
      ids.add(row.fromUserId);
      ids.add(row.toUserId);
    }
    const usernames = await this.usernamesOf([...ids]);

    return {
      friends: accepted.map((row) => this.toFriendDto(row, userId, usernames)),
      incoming: incoming.map((row) => this.toRequestDto(row, usernames)),
      outgoing: outgoing.map((row) => this.toRequestDto(row, usernames)),
    };
  }

  /**
   * FR-2: one user sends a request, the other accepts. A request to yourself is 400; an
   * existing pending or accepted row between the two is 409, except an incoming pending
   * request from the target, which this call accepts directly.
   */
  async sendRequest(
    userId: string,
    toUserId: string,
  ): Promise<FriendsResponse> {
    if (userId === toUserId) {
      throw new BadRequestException(
        'You cannot send a friend request to yourself',
      );
    }
    const target = await this.users.findById(toUserId);
    if (target === null) {
      throw new NotFoundException('User not found');
    }

    const rows = await this.rowsBetween(userId, toUserId);
    if (rows.some((row) => row.status === 'accepted')) {
      throw new ConflictException('You are already friends with this user');
    }

    const pending = rows.find((row) => row.status === 'pending');
    if (pending !== undefined) {
      if (pending.fromUserId === userId) {
        throw new ConflictException(
          'A friend request to this user is already pending',
        );
      }
      // The target already asked: accepting is the state both sides want.
      pending.status = 'accepted';
      await this.requests.save(pending);
      return this.getFriends(userId);
    }

    // A declined row in the same direction is reused: the unique pair is (from, to).
    const declined = rows.find((row) => row.fromUserId === userId);
    if (declined !== undefined) {
      declined.status = 'pending';
      await this.requests.save(declined);
      return this.getFriends(userId);
    }

    await this.requests.save(
      this.requests.create({ fromUserId: userId, toUserId, status: 'pending' }),
    );
    return this.getFriends(userId);
  }

  /** FR-2: only the receiver accepts. */
  async accept(userId: string, requestId: string): Promise<FriendsResponse> {
    const request = await this.pendingOrThrow(requestId);
    if (request.toUserId !== userId) {
      throw new ForbiddenException('Only the receiver can accept this request');
    }
    request.status = 'accepted';
    await this.requests.save(request);
    return this.getFriends(userId);
  }

  /** FR-4: only the receiver declines. */
  async decline(userId: string, requestId: string): Promise<FriendsResponse> {
    const request = await this.pendingOrThrow(requestId);
    if (request.toUserId !== userId) {
      throw new ForbiddenException(
        'Only the receiver can decline this request',
      );
    }
    request.status = 'declined';
    await this.requests.save(request);
    return this.getFriends(userId);
  }

  /** FR-4: only the sender cancels; the pending row is removed entirely. */
  async cancel(userId: string, requestId: string): Promise<FriendsResponse> {
    const request = await this.pendingOrThrow(requestId);
    if (request.fromUserId !== userId) {
      throw new ForbiddenException('Only the sender can cancel this request');
    }
    await this.requests.delete(request.id);
    return this.getFriends(userId);
  }

  /**
   * FR-4: removing a friend drops the accepted row(s) in both directions and every share
   * between the two users, in either direction.
   */
  async remove(userId: string, otherUserId: string): Promise<FriendsResponse> {
    if (userId === otherUserId) {
      throw new BadRequestException('You cannot remove yourself');
    }
    const rows = await this.rowsBetween(userId, otherUserId);
    const acceptedIds = rows
      .filter((row) => row.status === 'accepted')
      .map((row) => row.id);
    if (acceptedIds.length === 0) {
      throw new NotFoundException('You are not friends with this user');
    }

    await this.removeSharesBetween(userId, otherUserId);
    await this.requests.delete(acceptedIds);
    return this.getFriends(userId);
  }

  /**
   * FR-3, FR-4: at most 10 matches; the caller and existing friends are marked, and a
   * pending request between the two (either direction) is reported by id.
   */
  async search(userId: string, query: string): Promise<UserSearchResponse> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { users: [] };
    }

    const found = await this.users.search(trimmed, USER_SEARCH_LIMIT);
    if (found.length === 0) {
      return { users: [] };
    }

    const ids = found.map((user) => user.id);
    const rows = await this.requests.find({
      where: [
        { fromUserId: userId, toUserId: In(ids) },
        { toUserId: userId, fromUserId: In(ids) },
      ],
    });

    const users: UserSearchResultDto[] = found.map((user) => {
      // Every row has the caller on one side; the caller's own entry must not
      // inherit flags from requests with third parties (FR-4).
      const between =
        user.id === userId
          ? []
          : rows.filter(
              (row) => row.fromUserId === user.id || row.toUserId === user.id,
            );
      const pending = between.find((row) => row.status === 'pending');
      return {
        id: user.id,
        username: user.username,
        isSelf: user.id === userId,
        isFriend: between.some((row) => row.status === 'accepted'),
        pendingRequestId: pending === undefined ? null : pending.id,
      };
    });
    return { users };
  }

  /** FR-4: the `recipe_shares` rows between two users, found by joining their recipes. */
  private async removeSharesBetween(
    userId: string,
    otherUserId: string,
  ): Promise<void> {
    const raw = await this.shares
      .createQueryBuilder('share')
      .innerJoin(RecipeEntity, 'recipe', 'recipe.id = share.recipeId')
      .where(
        '(recipe.ownerId = :userId AND share.userId = :otherUserId) OR (recipe.ownerId = :otherUserId AND share.userId = :userId)',
        { userId, otherUserId },
      )
      .select('share.id', 'shareId')
      .getRawMany<{ shareId: string }>();

    const shareIds = raw.map((row) => row.shareId);
    if (shareIds.length > 0) {
      await this.shares.delete(shareIds);
    }
  }

  private async acceptedRowsOf(userId: string): Promise<FriendRequestEntity[]> {
    return this.requests.find({
      where: [
        { fromUserId: userId, status: 'accepted' },
        { toUserId: userId, status: 'accepted' },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  private async rowsBetween(
    a: string,
    b: string,
  ): Promise<FriendRequestEntity[]> {
    return this.requests.find({
      where: [
        { fromUserId: a, toUserId: b },
        { fromUserId: b, toUserId: a },
      ],
    });
  }

  private async pendingOrThrow(
    requestId: string,
  ): Promise<FriendRequestEntity> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (request === null) {
      throw new NotFoundException('Friend request not found');
    }
    if (request.status !== 'pending') {
      throw new ConflictException('This friend request is no longer pending');
    }
    return request;
  }

  private async usernamesOf(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map<string, string>();
    }
    const users = await this.users.findByIds(ids);
    return new Map(users.map((user) => [user.id, user.username]));
  }

  private toFriendDto(
    row: FriendRequestEntity,
    userId: string,
    usernames: Map<string, string>,
  ): FriendDto {
    const otherId = row.fromUserId === userId ? row.toUserId : row.fromUserId;
    return {
      userId: otherId,
      username: usernames.get(otherId) ?? '',
      // FR-2: the friendship began when the row was accepted.
      since: row.updatedAt.toISOString(),
    };
  }

  private toRequestDto(
    row: FriendRequestEntity,
    usernames: Map<string, string>,
  ): FriendRequestDto {
    return {
      id: row.id,
      fromUserId: row.fromUserId,
      fromUsername: usernames.get(row.fromUserId) ?? '',
      toUserId: row.toUserId,
      toUsername: usernames.get(row.toUserId) ?? '',
      createdAt: row.createdAt.toISOString(),
    };
  }
}

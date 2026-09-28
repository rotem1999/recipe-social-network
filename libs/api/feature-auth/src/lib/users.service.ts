import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '@rsn/api/data-access-db';
import type { UserDto } from '@rsn/shared/util-contracts';
import {
  MAX_FAVOURITE_CATEGORIES,
  isCategory,
  type Category,
} from '@rsn/shared/util-domain';
import { escapeLike, normaliseEmail, normaliseUsername } from './normalise';

/** AUTH-2, AUTH-5, DISC-6, FR-4: the only reader and writer of the `users` table. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  /** Bulk load for the feature libraries that show owner or friend usernames. */
  async findByIds(ids: string[]): Promise<UserEntity[]> {
    if (ids.length === 0) return [];
    // Duplicates in the caller's list would otherwise widen the IN list for nothing.
    return this.users.find({ where: { id: In([...new Set(ids)]) } });
  }

  /** AUTH-5: usernames are stored lower-case, so the lookup normalises first. */
  findByUsername(username: string): Promise<UserEntity | null> {
    return this.users.findOne({
      where: { username: normaliseUsername(username) },
    });
  }

  /** AUTH-5: emails are stored lower-case and are unique when present. */
  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalised = normaliseEmail(email);
    if (normalised === null) return null;
    return this.users.findOne({ where: { email: normalised } });
  }

  /** AUTH-5: creates the record; the caller has already hashed the password (AUTH-6). */
  create(input: {
    username: string;
    email: string | null;
    passwordHash: string;
  }): Promise<UserEntity> {
    const user = this.users.create({
      username: normaliseUsername(input.username),
      email: normaliseEmail(input.email),
      passwordHash: input.passwordHash,
      favouriteCategories: [],
    });
    return this.users.save(user);
  }

  /** §11.6: the public shape of a user; the password hash never leaves this library. */
  toDto(user: UserEntity): UserDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      favouriteCategories: user.favouriteCategories ?? [],
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** DISC-6, DISC-9: at most three categories, each one of the 14 names. */
  async setFavouriteCategories(
    userId: string,
    categories: Category[],
  ): Promise<UserDto> {
    if (categories.length > MAX_FAVOURITE_CATEGORIES) {
      throw new BadRequestException(
        `At most ${MAX_FAVOURITE_CATEGORIES} favourite categories`,
      );
    }
    for (const category of categories) {
      if (!isCategory(category)) {
        throw new BadRequestException(`Unknown category: ${String(category)}`);
      }
    }
    if (new Set(categories).size !== categories.length) {
      throw new BadRequestException('Favourite categories must be distinct');
    }

    const user = await this.findById(userId);
    if (user === null) {
      throw new BadRequestException('Unknown user');
    }
    user.favouriteCategories = [...categories];
    const saved = await this.users.save(user);
    return this.toDto(saved);
  }

  /**
   * FR-4: find people by a username prefix (case-insensitive) or by their exact
   * email. Nothing is excluded here; the caller decides how to flag self and
   * existing friends.
   */
  async search(query: string, limit: number): Promise<UserEntity[]> {
    const needle = normaliseUsername(query);
    // An empty query would otherwise match every user.
    if (needle.length === 0 || limit <= 0) return [];

    return this.users
      .createQueryBuilder('user')
      .where('user.username ILIKE :prefix', {
        prefix: `${escapeLike(needle)}%`,
      })
      .orWhere('user.email = :exact', { exact: needle })
      .orderBy('user.username', 'ASC')
      .limit(limit)
      .getMany();
  }
}

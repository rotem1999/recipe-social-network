// AUTH-5, DISC-6, FR-3, FR-4: the users table reader and writer.
import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { In } from 'typeorm';
import type { UserEntity } from '@rsn/api/data-access-db';
import type { Category } from '@rsn/shared/util-domain';
import { UsersService } from './users.service';

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
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
  ConfigModule: { forRoot: () => ({}), forFeature: () => ({}) },
}));


const CREATED_AT = new Date('2026-09-28T10:00:00.000Z');

function userRow(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    username: 'rotem',
    email: 'rotem@example.com',
    passwordHash: 'scrypt$131072$8$1$c2FsdA==$a2V5',
    favouriteCategories: [],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  } as UserEntity;
}

interface QueryBuilderFake {
  where: jest.Mock;
  orWhere: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  getMany: jest.Mock;
}

function queryBuilderFake(rows: UserEntity[]): QueryBuilderFake {
  const builder: Partial<QueryBuilderFake> = {};
  builder.where = jest.fn(() => builder);
  builder.orWhere = jest.fn(() => builder);
  builder.orderBy = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.getMany = jest.fn().mockResolvedValue(rows);
  return builder as QueryBuilderFake;
}

interface Harness {
  service: UsersService;
  repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  builder: QueryBuilderFake;
}

function harness(searchRows: UserEntity[] = []): Harness {
  const builder = queryBuilderFake(searchRows);
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((input: Partial<UserEntity>) => input as UserEntity),
    save: jest.fn((input: UserEntity) => Promise.resolve(input)),
    createQueryBuilder: jest.fn(() => builder),
  };
  return {
    service: new UsersService(repo as unknown as Repository<UserEntity>),
    repo,
    builder,
  };
}

describe('UsersService', () => {
  describe('AUTH-5 lookups and creation', () => {
    it('AUTH-5 looks a username up lower-cased and trimmed', async () => {
      const { service, repo } = harness();

      await service.findByUsername('  RoTeM ');

      expect(repo.findOne).toHaveBeenCalledWith({ where: { username: 'rotem' } });
    });

    it('AUTH-5 looks an email up lower-cased and trimmed', async () => {
      const { service, repo } = harness();

      await service.findByEmail(' Rotem@Example.COM ');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { email: 'rotem@example.com' },
      });
    });

    it('AUTH-5 never queries for a blank email', async () => {
      const { service, repo } = harness();

      await expect(service.findByEmail('   ')).resolves.toBeNull();

      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('AUTH-5 creates the row lower-cased with no favourite categories', async () => {
      const { service, repo } = harness();

      await service.create({
        username: 'RoTeM',
        email: 'Rotem@Example.com',
        passwordHash: 'scrypt$131072$8$1$c2FsdA==$a2V5',
      });

      expect(repo.create).toHaveBeenCalledWith({
        username: 'rotem',
        email: 'rotem@example.com',
        passwordHash: 'scrypt$131072$8$1$c2FsdA==$a2V5',
        favouriteCategories: [],
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('AUTH-5 loads a batch of users once per distinct id', async () => {
      const { service, repo } = harness();

      await service.findByIds(['a', 'b', 'a']);

      expect(repo.find).toHaveBeenCalledWith({ where: { id: In(['a', 'b']) } });
    });

    it('AUTH-5 skips the query for an empty batch', async () => {
      const { service, repo } = harness();

      await expect(service.findByIds([])).resolves.toEqual([]);

      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('§11.6 toDto', () => {
    it('AUTH-5 leaves the password hash out of the DTO', () => {
      const { service } = harness();

      const dto = service.toDto(userRow({ favouriteCategories: ['Beef'] }));

      expect(dto).toEqual({
        id: 'user-1',
        username: 'rotem',
        email: 'rotem@example.com',
        favouriteCategories: ['Beef'],
        createdAt: CREATED_AT.toISOString(),
      });
      expect(Object.keys(dto)).not.toContain('passwordHash');
    });
  });

  describe('FR-4 search', () => {
    it('FR-4 matches a username prefix case-insensitively or an exact email, ordered and capped', async () => {
      const rows = [userRow()];
      const { service, repo, builder } = harness(rows);

      await expect(service.search(' RoT ', 10)).resolves.toBe(rows);

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(builder.where).toHaveBeenCalledWith('user.username ILIKE :prefix', {
        prefix: 'rot%',
      });
      expect(builder.orWhere).toHaveBeenCalledWith('user.email = :exact', {
        exact: 'rot',
      });
      expect(builder.orderBy).toHaveBeenCalledWith('user.username', 'ASC');
      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('FR-4 escapes the LIKE wildcards a username may contain', async () => {
      const { service, builder } = harness();

      await service.search('ro_te%m', 10);

      expect(builder.where).toHaveBeenCalledWith('user.username ILIKE :prefix', {
        prefix: 'ro\\_te\\%m%',
      });
    });

    it('FR-4 returns nothing for an empty query without touching the database', async () => {
      const { service, repo } = harness();

      await expect(service.search('   ', 10)).resolves.toEqual([]);

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('FR-4 returns nothing for a non-positive limit', async () => {
      const { service, repo } = harness();

      await expect(service.search('rot', 0)).resolves.toEqual([]);

      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('DISC-6 setFavouriteCategories', () => {
    it('DISC-6 stores up to three known categories', async () => {
      const { service, repo } = harness();
      const stored = userRow();
      repo.findOne.mockResolvedValue(stored);

      const dto = await service.setFavouriteCategories('user-1', [
        'Beef',
        'Dessert',
        'Vegan',
      ]);

      expect(stored.favouriteCategories).toEqual(['Beef', 'Dessert', 'Vegan']);
      expect(repo.save).toHaveBeenCalledWith(stored);
      expect(dto.favouriteCategories).toEqual(['Beef', 'Dessert', 'Vegan']);
    });

    it('DISC-6 clears the favourites when the list is empty', async () => {
      const { service, repo } = harness();
      repo.findOne.mockResolvedValue(userRow({ favouriteCategories: ['Beef'] }));

      const dto = await service.setFavouriteCategories('user-1', []);

      expect(dto.favouriteCategories).toEqual([]);
    });

    it('DISC-6 answers 400 for a fourth category', async () => {
      const { service, repo } = harness();

      await expect(
        service.setFavouriteCategories('user-1', [
          'Beef',
          'Dessert',
          'Vegan',
          'Pasta',
        ]),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setFavouriteCategories('user-1', [
          'Beef',
          'Dessert',
          'Vegan',
          'Pasta',
        ]),
      ).rejects.toThrow('At most 3 favourite categories');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('DISC-7 answers 400 for a category outside the 14', async () => {
      const { service, repo } = harness();

      await expect(
        service.setFavouriteCategories('user-1', [
          'Beef',
          'Tacos' as Category,
        ]),
      ).rejects.toThrow('Unknown category: Tacos');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('DISC-6 answers 400 for a repeated category', async () => {
      const { service, repo } = harness();

      await expect(
        service.setFavouriteCategories('user-1', ['Beef', 'Beef']),
      ).rejects.toThrow('Favourite categories must be distinct');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('DISC-6 answers 400 for an unknown user', async () => {
      const { service, repo } = harness();
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.setFavouriteCategories('ghost', ['Beef']),
      ).rejects.toThrow('Unknown user');
    });
  });
});

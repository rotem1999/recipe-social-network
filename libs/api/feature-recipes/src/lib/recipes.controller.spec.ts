// §11.6 `POST /recipes/:id/sync` (SAVE-10): the route is declared on the controller and
// hands the caller and the id to RecipesService.sync. No HTTP server is started.
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { AuthUser } from '@rsn/api/feature-auth';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { RecipesController } from './recipes.controller';
import type { RecipesService } from './recipes.service';

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

const USER: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'rotem',
};
const COPY_ID = '33333333-3333-4333-8333-333333333333';

describe('RecipesController', () => {
  describe('SAVE-10 sync', () => {
    it('SAVE-10 is routed as POST :id/sync under /recipes', () => {
      const handler = RecipesController.prototype.sync;

      expect(Reflect.getMetadata(PATH_METADATA, RecipesController)).toBe(
        'recipes',
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id/sync');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
    });

    it('SAVE-10 hands the caller id and the recipe id to RecipesService.sync and returns its detail', async () => {
      const detail = { id: COPY_ID } as RecipeDetailDto;
      const recipes = { sync: jest.fn().mockResolvedValue(detail) };
      const controller = new RecipesController(
        recipes as unknown as RecipesService,
      );

      await expect(controller.sync(USER, COPY_ID)).resolves.toBe(detail);
      expect(recipes.sync).toHaveBeenCalledWith(USER.id, COPY_ID);
    });
  });
});

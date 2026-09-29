// §11.6 `GET /discover/catalogue/:mealId` (CAT-2, DISC-10): the controller hands the
// caller to the service so the preview can carry the caller's copy id. No HTTP server.
import type { AuthUser } from '@rsn/api/feature-auth';
import type { CataloguePreviewDto } from '@rsn/shared/util-contracts';
import { DiscoverController } from './discover.controller';
import type { DiscoverService } from './discover.service';

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

describe('DiscoverController', () => {
  it('DISC-10 passes the caller id and the meal id to cataloguePreview', async () => {
    const preview = { mealId: '52772', myCopyId: 'copy-1' } as CataloguePreviewDto;
    const discoverService = {
      cataloguePreview: jest.fn().mockResolvedValue(preview),
    };
    const controller = new DiscoverController(
      discoverService as unknown as DiscoverService,
    );

    await expect(
      controller.cataloguePreview(USER, { mealId: '52772' }),
    ).resolves.toBe(preview);
    expect(discoverService.cataloguePreview).toHaveBeenCalledWith(
      USER.id,
      '52772',
    );
  });
});

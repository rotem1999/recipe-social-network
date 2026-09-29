// SPEC §11.6: `GET /health` is the liveness route of apps/api.
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';

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


describe('AppController (SPEC §11.6 GET /health)', () => {
  let controller: AppController;

  beforeAll(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = app.get<AppController>(AppController);
  });

  it('§11.6 answers GET /health with status "ok" and a time', () => {
    const response = controller.health();

    expect(response).toEqual({
      status: 'ok',
      time: expect.any(String),
    });
  });

  it('§11.6 reports the time as an ISO 8601 UTC instant', () => {
    const { time } = controller.health();

    expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(time).toISOString()).toBe(time);
  });

  it('§11.6 needs no request context: the route carries no input', () => {
    expect(controller.health).toHaveLength(0);
  });
});

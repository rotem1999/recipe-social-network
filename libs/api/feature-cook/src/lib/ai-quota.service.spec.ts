// SPEC §7 COOK-8, COOK-10: the shared per-user daily AI budget. No database: the
// repository is a hand-written fake whose `query` returns the RETURNING rows.
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AiQuotaService } from './ai-quota.service';

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


const USER_ID = '22222222-2222-4222-8222-222222222222';

interface Harness {
  service: AiQuotaService;
  query: jest.Mock;
  configGet: jest.Mock;
}

function makeHarness(envValue?: string | number): Harness {
  const query = jest.fn().mockResolvedValue([]);
  const configGet = jest.fn((key: string) =>
    key === 'OPENROUTER_SHARED_DAILY_QUOTA_PER_USER' ? envValue : undefined,
  );
  const service = new AiQuotaService({ query } as never, {
    get: configGet,
  } as unknown as ConfigService);
  return { service, query, configGet };
}

/** §12.1 `ai_daily_usage.day` is a UTC date. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('AiQuotaService.consume (COOK-8, COOK-10)', () => {
  it('COOK-8 runs the atomic upsert for today (UTC) and returns used, limit and remaining', async () => {
    const harness = makeHarness(100);
    harness.query.mockResolvedValue([{ count: 7 }]);

    await expect(harness.service.consume(USER_ID)).resolves.toEqual({
      used: 7,
      limit: 100,
      remaining: 93,
    });

    expect(harness.query).toHaveBeenCalledTimes(1);
    const [sql, params] = harness.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO "ai_daily_usage"');
    expect(sql).toContain('ON CONFLICT ("user_id", "day") DO UPDATE');
    expect(sql).toContain('RETURNING "count"');
    expect(params).toEqual([USER_ID, utcToday(), 100]);
  });

  it('COOK-8 counts the request before any model call, so `used` is already raised', async () => {
    const harness = makeHarness(100);
    harness.query.mockResolvedValue([{ count: 1 }]);

    const quota = await harness.service.consume(USER_ID);

    expect(quota.used).toBe(1);
    expect(quota.remaining).toBe(99);
  });

  it('COOK-10 throws 429 carrying the quota when the upsert returns no row', async () => {
    const harness = makeHarness(100);
    // The upsert wrote nothing (already at the limit); `current` then reads the row.
    harness.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 100 }]);

    const error = await harness.service
      .consume(USER_ID)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(HttpException);
    const http = error as HttpException;
    expect(http.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(http.getResponse()).toEqual({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Daily AI quota reached',
      quota: { used: 100, limit: 100, remaining: 0 },
    });
  });

  it('COOK-8 defaults the limit to 100 when the environment variable is missing', async () => {
    const harness = makeHarness(undefined);
    harness.query.mockResolvedValue([{ count: 4 }]);

    await expect(harness.service.consume(USER_ID)).resolves.toEqual({
      used: 4,
      limit: 100,
      remaining: 96,
    });
    expect(harness.query.mock.calls[0][1]).toEqual([USER_ID, utcToday(), 100]);
  });

  it('COOK-8 defaults the limit to 100 when the environment value is not a whole number', async () => {
    const harness = makeHarness('not-a-number');
    harness.query.mockResolvedValue([{ count: 1 }]);

    await expect(harness.service.consume(USER_ID)).resolves.toEqual({
      used: 1,
      limit: 100,
      remaining: 99,
    });
  });

  it('COOK-8 takes the limit from OPENROUTER_SHARED_DAILY_QUOTA_PER_USER when it is set', async () => {
    const harness = makeHarness('5');
    harness.query.mockResolvedValue([{ count: 5 }]);

    await expect(harness.service.consume(USER_ID)).resolves.toEqual({
      used: 5,
      limit: 5,
      remaining: 0,
    });
    expect(harness.configGet).toHaveBeenCalledWith(
      'OPENROUTER_SHARED_DAILY_QUOTA_PER_USER',
    );
  });

  it('COOK-8 refuses without touching the table when the configured limit is 0', async () => {
    const harness = makeHarness(0);

    const error = await harness.service
      .consume(USER_ID)
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toEqual({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Daily AI quota reached',
      quota: { used: 0, limit: 0, remaining: 0 },
    });
    expect(harness.query).not.toHaveBeenCalled();
  });
});

describe('AiQuotaService.current (COOK-8, COOK-10)', () => {
  it('COOK-10 reports today (UTC) usage for GET /cook/quota', async () => {
    const harness = makeHarness(100);
    harness.query.mockResolvedValue([{ count: 12 }]);

    await expect(harness.service.current(USER_ID)).resolves.toEqual({
      used: 12,
      limit: 100,
      remaining: 88,
    });
    expect(harness.query.mock.calls[0][1]).toEqual([USER_ID, utcToday()]);
  });

  it('COOK-10 reports zero usage when the user has no row for today', async () => {
    const harness = makeHarness(100);
    harness.query.mockResolvedValue([]);

    await expect(harness.service.current(USER_ID)).resolves.toEqual({
      used: 0,
      limit: 100,
      remaining: 100,
    });
  });

  it('COOK-8 never reports a negative remaining count', async () => {
    const harness = makeHarness(10);
    harness.query.mockResolvedValue([{ count: 14 }]);

    await expect(harness.service.current(USER_ID)).resolves.toEqual({
      used: 14,
      limit: 10,
      remaining: 0,
    });
  });
});

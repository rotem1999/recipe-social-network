// SPEC §3.3 CAT-1/CAT-2/CAT-6, DISC-7/DISC-9 (§16 M1, M8): the only TheMealDB
// client. `fetch` is mocked; the key below is a placeholder, never a real one.

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TheMealDbService } from './themealdb.service';

/** §16 M1: the verified v2 URL format is `<base>/<key>/<endpoint>.php`. */
const V2_BASE_URL = 'https://www.themealdb.com/api/json/v2';
const TEST_KEY = 'test-key';

// SPEC §16 V16: @nestjs/config 12 ships ESM only while this Jest project is
// CommonJS (§11.1), and the unit under test imports ConfigService for DI. The
// module is mocked at its boundary so the unit loads; configuration still
// reaches it only through the explicit stub below.
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

function configStub(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('TheMealDbService', () => {
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function service(
    values: Record<string, string> = {
      THEMEALDB_KEY: TEST_KEY,
      THEMEALDB_BASE_URL: V2_BASE_URL,
    },
  ): TheMealDbService {
    return new TheMealDbService(configStub(values));
  }

  it('CAT-1 calls the v2 URL `${base}/${key}/filter.php?c=Beef`', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ meals: [] }));

    await service().listByCategory('Beef');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${V2_BASE_URL}/${TEST_KEY}/filter.php?c=Beef`,
    );
  });

  it('CAT-1 trims a trailing slash off the configured base URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ meals: [] }));

    await service({
      THEMEALDB_KEY: TEST_KEY,
      THEMEALDB_BASE_URL: `${V2_BASE_URL}/`,
    }).listByCategory('Beef');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${V2_BASE_URL}/${TEST_KEY}/filter.php?c=Beef`,
    );
  });

  it('DISC-9 maps the filter.php rows onto catalogue entries of that category', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        meals: [
          {
            idMeal: '52874',
            strMeal: 'Beef and Mustard Pie',
            strMealThumb:
              'https://www.themealdb.com/images/media/meals/pie.jpg',
          },
        ],
      }),
    );

    await expect(service().listByCategory('Beef')).resolves.toEqual([
      {
        mealId: '52874',
        name: 'Beef and Mustard Pie',
        thumbnailUrl: 'https://www.themealdb.com/images/media/meals/pie.jpg',
        category: 'Beef',
        // DISC-10: feature-discover fills the caller's copy id later.
        myCopyId: null,
      },
    ]);
  });

  it('CAT-6 returns an empty list when TheMealDB answers `meals: null`', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ meals: null }));

    await expect(service().listByCategory('Goat')).resolves.toEqual([]);
  });

  it('§16 M8 treats a non-array `meals` as empty and warns once', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ meals: { idMeal: '52772' } }));
    const client = service();

    await expect(client.listByCategory('Beef')).resolves.toEqual([]);
    await expect(client.listByCategory('Pork')).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('object instead of an array');
  });

  it('CAT-6 returns the first meal of lookup.php and null for an unknown id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ meals: [{ idMeal: '52772', strMeal: 'Teriyaki' }] }),
    );
    await expect(service().lookup('52772')).resolves.toMatchObject({
      idMeal: '52772',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${V2_BASE_URL}/${TEST_KEY}/lookup.php?i=52772`,
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ meals: null }));
    await expect(service().lookup('000')).resolves.toBe(null);
  });

  it('DISC-7 reads the category names from list.php and drops empty ones', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        meals: [
          { strCategory: 'Beef' },
          { strCategory: '  ' },
          { strCategory: null },
          { strCategory: ' Dessert ' },
        ],
      }),
    );

    await expect(service().listCategories()).resolves.toEqual([
      'Beef',
      'Dessert',
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${V2_BASE_URL}/${TEST_KEY}/list.php?c=list`,
    );
  });

  it('CAT-1 refuses without a key and makes no request', async () => {
    await expect(
      service({ THEMEALDB_BASE_URL: V2_BASE_URL }).listByCategory('Beef'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      service({ THEMEALDB_KEY: '  ', THEMEALDB_BASE_URL: V2_BASE_URL })
        .listByCategory('Beef'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CAT-1 refuses without a base URL and makes no request', async () => {
    await expect(
      service({ THEMEALDB_KEY: TEST_KEY }).listByCategory('Beef'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('CAT-1 turns a non-2xx answer into ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as unknown as Response);

    await expect(service().listByCategory('Beef')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('CAT-1 turns a network failure into ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service().listByCategory('Beef')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

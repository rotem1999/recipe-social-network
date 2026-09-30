// SPEC §9 NUT-2/NUT-5/NUT-6/NUT-8/NUT-9 (§16 U1–U9, U13, U14): the FoodData Central client. `fetch`
// is mocked; the key is a placeholder and every field name comes from §9.

import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { UsdaService } from './usda.service';
import type { UsdaDataType } from './usda.types';

/** §16 U1: the verified FoodData Central base URL. */
const VERIFIED_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const TEST_KEY = 'test-key';

/** NUT-6: the three data types ingredient search uses. */
const INGREDIENT_DATA_TYPES: UsdaDataType[] = [
  'SR Legacy',
  'Foundation',
  'Survey (FNDDS)',
];

// SPEC §16 V16: @nestjs/config 12 ships ESM only while this Jest project is
// CommonJS (§11.1), and the unit under test imports ConfigService for DI. The
// module is mocked at its boundary so the unit loads; configuration still
// reaches it only through the explicit stub below.
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

function configStub(
  values: Record<string, string> = { USDA_FDC_KEY: TEST_KEY },
): ConfigService {
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

function statusResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

/** §9: a `POST /foods/search` hit; nutrient ids carry the value in `value`. */
function searchHit(foodNutrients: unknown[], overrides: object = {}) {
  return {
    fdcId: 171705,
    description: 'Onions, raw',
    dataType: 'SR Legacy',
    foodNutrients,
    ...overrides,
  };
}

describe('UsdaService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function service(values?: Record<string, string>): UsdaService {
    return new UsdaService(configStub(values));
  }

  describe('searchFoods', () => {
    it('NUT-8 posts the query, the dataType array and pageSize 25 to /foods/search', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));

      await service().searchFoods('onion', INGREDIENT_DATA_TYPES);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${VERIFIED_BASE_URL}/foods/search?api_key=${TEST_KEY}`,
      );
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
      expect(JSON.parse(String(init.body))).toEqual({
        query: 'onion',
        dataType: INGREDIENT_DATA_TYPES,
        pageSize: 25,
        pageNumber: 1,
      });
    });

    it('NUT-8 sends the query as given, `+` operators included (§16 U13)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));

      await service().searchFoods('+ground +beef raw', INGREDIENT_DATA_TYPES);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).query).toBe('+ground +beef raw');
    });

    it("NUT-8 keeps every hit USDA returns, in USDA's order", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          foods: [
            searchHit([{ nutrientId: 1008, value: 200 }], {
              fdcId: 1,
              description: 'Garlic sauce',
            }),
            searchHit([{ nutrientId: 1008, value: 140 }], {
              fdcId: 2,
              description: 'Garlic, cooked',
            }),
            searchHit([{ nutrientId: 1008, value: 149 }], {
              fdcId: 3,
              description: 'Garlic, raw',
            }),
          ],
        }),
      );

      const hits = await service().searchFoods('+garlic raw', INGREDIENT_DATA_TYPES);
      expect(hits.map((hit) => hit.description)).toEqual([
        'Garlic sauce',
        'Garlic, cooked',
        'Garlic, raw',
      ]);
    });

    it('NUT-6 caches the strict and the plain query separately', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));
      const client = service();

      await client.searchFoods('+plum +tomatoes raw', INGREDIENT_DATA_TYPES);
      await client.searchFoods('Plum Tomatoes', INGREDIENT_DATA_TYPES);
      await client.searchFoods('+plum +tomatoes raw', INGREDIENT_DATA_TYPES);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('NUT-6 uses the configured base URL without its trailing slash', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));

      await service({
        USDA_FDC_KEY: TEST_KEY,
        USDA_FDC_BASE_URL: `${VERIFIED_BASE_URL}/`,
      }).searchFoods('onion', ['Survey (FNDDS)']);

      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${VERIFIED_BASE_URL}/foods/search?api_key=${TEST_KEY}`,
      );
    });

    it('§9 reads energy from nutrient 1008 first', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          foods: [
            searchHit([
              { nutrientId: 2048, value: 44 },
              { nutrientId: 2047, value: 42 },
              { nutrientId: 1008, value: 40 },
            ]),
          ],
        }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.kcalPer100g).toBe(40);
    });

    it('§9 falls back to 2047 before 2048 when 1008 is absent', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          foods: [
            searchHit([
              { nutrientId: 2048, value: 44 },
              { nutrientId: 2047, value: 42 },
            ]),
          ],
        }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.kcalPer100g).toBe(42);
    });

    it('§9 uses 2048 when it is the only Atwater id present', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ foods: [searchHit([{ nutrientId: 2048, value: 44 }])] }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.kcalPer100g).toBe(44);
    });

    it('§9 never reads 1062 (kJ) as energy', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ foods: [searchHit([{ nutrientId: 1062, value: 167 }])] }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.kcalPer100g).toBe(null);
    });

    it('NUT-5 leaves a missing energy id null, never zero', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ foods: [searchHit([{ nutrientId: 1003, value: 1.1 }])] }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.kcalPer100g).toBe(null);
      expect(hit.kcalPer100g).not.toBe(0);
    });

    it('§9 accepts both the `nutrientId`/`value` and the `nutrient.id`/`amount` shapes', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          foods: [
            searchHit([{ nutrientId: 1008, value: 40 }]),
            searchHit([{ nutrient: { id: 1008 }, amount: 139 }], {
              fdcId: 782203,
              description: 'Lasagna with meat',
              dataType: 'Survey (FNDDS)',
            }),
          ],
        }),
      );

      const hits = await service().searchFoods('lasagna', ['Survey (FNDDS)']);
      expect(hits.map((hit) => hit.kcalPer100g)).toEqual([40, 139]);
    });

    it('NUT-6 keeps fdcId, description, dataType and foodMeasures[0].gramWeight', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          foods: [
            searchHit([{ nutrientId: 1008, value: 139 }], {
              fdcId: 782203,
              description: 'Lasagna with meat',
              dataType: 'Survey (FNDDS)',
              foodMeasures: [{ gramWeight: 250 }, { gramWeight: 500 }],
            }),
          ],
        }),
      );

      await expect(
        service().searchFoods('lasagna', ['Survey (FNDDS)']),
      ).resolves.toEqual([
        {
          fdcId: 782203,
          description: 'Lasagna with meat',
          dataType: 'Survey (FNDDS)',
          kcalPer100g: 139,
          gramWeightPerMeasure: 250,
        },
      ]);
    });

    it('NUT-6 tolerates a search result without foodMeasures', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ foods: [searchHit([{ nutrientId: 1008, value: 40 }])] }),
      );

      const [hit] = await service().searchFoods('onion', INGREDIENT_DATA_TYPES);
      expect(hit.gramWeightPerMeasure).toBe(null);
    });

    it('NUT-6 answers a repeated query from the 24-hour cache without a second fetch', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ foods: [searchHit([{ nutrientId: 1008, value: 40 }])] }),
      );
      const client = service();

      const first = await client.searchFoods('onion', INGREDIENT_DATA_TYPES);
      const second = await client.searchFoods('onion', INGREDIENT_DATA_TYPES);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('NUT-6 fetches again for a different query or data-type list', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));
      const client = service();

      await client.searchFoods('onion', INGREDIENT_DATA_TYPES);
      await client.searchFoods('garlic', INGREDIENT_DATA_TYPES);
      await client.searchFoods('onion', ['Survey (FNDDS)']);

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('NUT-6 fetches again once the cached entry is older than 24 hours', async () => {
      const start = Date.UTC(2026, 8, 28, 12, 0, 0);
      let now = start;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      fetchMock.mockResolvedValue(jsonResponse({ foods: [] }));
      const client = service();

      await client.searchFoods('onion', INGREDIENT_DATA_TYPES);
      now = start + 24 * 60 * 60 * 1000 + 1;
      await client.searchFoods('onion', INGREDIENT_DATA_TYPES);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('§9 surfaces a 429 as an HTTP 429, not as a 503', async () => {
      fetchMock.mockResolvedValue(statusResponse(429));

      const error = await service()
        .searchFoods('onion', INGREDIENT_DATA_TYPES)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    });

    it('§9 turns any other failure into a 503', async () => {
      fetchMock.mockResolvedValue(statusResponse(500));
      await expect(
        service().searchFoods('onion', INGREDIENT_DATA_TYPES),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(
        service().searchFoods('garlic', INGREDIENT_DATA_TYPES),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('NUT-2 refuses without a key and makes no request', async () => {
      await expect(
        service({}).searchFoods('onion', INGREDIENT_DATA_TYPES),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getFood', () => {
    it('NUT-6 reads the food detail and its foodPortions gram weights', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 171705,
          description: 'Onions, raw',
          foodNutrients: [{ nutrient: { id: 1008 }, amount: 40 }],
          foodPortions: [
            { gramWeight: 110, portionDescription: '1 medium' },
            { gramWeight: 160, modifier: 'large' },
            { portionDescription: 'no gram weight' },
          ],
        }),
      );

      await expect(service().getFood(171705)).resolves.toEqual({
        fdcId: 171705,
        description: 'Onions, raw',
        kcalPer100g: 40,
        portions: [
          {
            gramWeight: 110,
            description: '1 medium',
            amount: null,
            sequenceNumber: null,
          },
          {
            gramWeight: 160,
            description: 'large',
            amount: null,
            sequenceNumber: null,
          },
        ],
      });
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `${VERIFIED_BASE_URL}/food/171705?api_key=${TEST_KEY}`,
      );
      expect(
        (fetchMock.mock.calls[0][1] as RequestInit).method,
      ).toBe('GET');
    });

    it('NUT-9 keeps `amount` for an SR Legacy `modifier` portion ("cloves", 3, 9 g; §16 U11 169230)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 169230,
          description: 'Garlic, raw',
          foodNutrients: [{ nutrient: { id: 1008 }, amount: 149 }],
          foodPortions: [
            { amount: 1, modifier: 'cup', gramWeight: 136, sequenceNumber: 1 },
            { amount: 3, modifier: 'cloves', gramWeight: 9, sequenceNumber: 3 },
            {
              amount: 1,
              modifier: 'tsp',
              portionDescription: '',
              gramWeight: 2.8,
              sequenceNumber: 2,
            },
          ],
        }),
      );

      const detail = await service().getFood(169230);
      expect(detail?.portions).toEqual([
        { gramWeight: 136, description: 'cup', amount: 1, sequenceNumber: 1 },
        { gramWeight: 9, description: 'cloves', amount: 3, sequenceNumber: 3 },
        { gramWeight: 2.8, description: 'tsp', amount: 1, sequenceNumber: 2 },
      ]);
    });

    it('NUT-9 drops `amount` when the text is an FNDDS `portionDescription` (§16 U14)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 2709786,
          description: 'Garlic, raw',
          foodNutrients: [{ nutrient: { id: 1008 }, amount: 143 }],
          foodPortions: [
            {
              portionDescription: '1 clove',
              modifier: '10205',
              amount: 1,
              gramWeight: 3,
              sequenceNumber: 2,
            },
            {
              portionDescription: 'Quantity not specified',
              modifier: '90000',
              gramWeight: 3,
              sequenceNumber: 3,
            },
          ],
        }),
      );

      const detail = await service().getFood(2709786);
      expect(detail?.portions).toEqual([
        { gramWeight: 3, description: '1 clove', amount: null, sequenceNumber: 2 },
        {
          gramWeight: 3,
          description: 'Quantity not specified',
          amount: null,
          sequenceNumber: 3,
        },
      ]);
    });

    it('NUT-9 appends `measureUnit.name` to a Foundation `modifier` ("whole without shell" + "egg"; §16 U11 748967)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 748967,
          description: 'Eggs',
          foodPortions: [
            {
              modifier: 'whole without shell',
              measureUnit: { name: 'egg' },
              amount: 1,
              gramWeight: 50.3,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(748967);
      expect(detail?.portions).toEqual([
        {
          gramWeight: 50.3,
          description: 'whole without shell egg',
          amount: 1,
          sequenceNumber: 1,
        },
      ]);
    });

    it('NUT-9 describes a Foundation portion with no modifier by its unit alone and keeps its amount ("RACC", 1; §16 U11 1104647, U15)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 1104647,
          description: 'Garlic, raw',
          foodPortions: [
            {
              measureUnit: { name: 'RACC' },
              amount: 1,
              gramWeight: 85,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(1104647);
      expect(detail?.portions).toEqual([
        { gramWeight: 85, description: 'RACC', amount: 1, sequenceNumber: 1 },
      ]);
    });

    it('NUT-9 keeps `amount` for a Foundation unit-only portion with an empty modifier ("0.2 cup" = 64.6 g, "0.5 cup" = 129 g; §16 U15 746766)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 746766,
          description: 'Cheese, ricotta, whole milk',
          foodPortions: [
            {
              portionDescription: '',
              modifier: '',
              measureUnit: { name: 'cup' },
              amount: 0.2,
              gramWeight: 64.6,
              sequenceNumber: 1,
            },
            {
              portionDescription: '',
              modifier: '',
              measureUnit: { name: 'cup' },
              amount: 0.5,
              gramWeight: 129,
              sequenceNumber: 2,
            },
          ],
        }),
      );

      const detail = await service().getFood(746766);
      expect(detail?.portions).toEqual([
        { gramWeight: 64.6, description: 'cup', amount: 0.2, sequenceNumber: 1 },
        { gramWeight: 129, description: 'cup', amount: 0.5, sequenceNumber: 2 },
      ]);
    });

    it('NUT-9 keeps `amount` for a Foundation unit-only portion with no modifier field ("5 tomatoes" = 49.7 g; §16 U15 321360)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 321360,
          description: 'Tomatoes, grape, raw',
          foodPortions: [
            {
              measureUnit: { name: 'tomatoes' },
              amount: 5,
              gramWeight: 49.7,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(321360);
      expect(detail?.portions).toEqual([
        { gramWeight: 49.7, description: 'tomatoes', amount: 5, sequenceNumber: 1 },
      ]);
    });

    it('NUT-9 keeps `amount` for a Foundation "2 tablespoon" portion (33.9 g; §16 U15 321358)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 321358,
          description: 'Hummus, commercial',
          foodPortions: [
            {
              modifier: '',
              measureUnit: { name: 'tablespoon' },
              amount: 2,
              gramWeight: 33.9,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(321358);
      expect(detail?.portions).toEqual([
        { gramWeight: 33.9, description: 'tablespoon', amount: 2, sequenceNumber: 1 },
      ]);
    });

    it('NUT-9 still drops `amount` for an FNDDS portion with a `portionDescription`, even with an empty modifier and a unit name (§16 U14, U15)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 2709786,
          description: 'Garlic, raw',
          foodPortions: [
            {
              portionDescription: '1 clove',
              modifier: '',
              measureUnit: { name: 'undetermined' },
              amount: 2,
              gramWeight: 3,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(2709786);
      expect(detail?.portions).toEqual([
        { gramWeight: 3, description: '1 clove', amount: null, sequenceNumber: 1 },
      ]);
    });

    it('NUT-9 leaves out a `measureUnit.name` of "undetermined"', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 169230,
          description: 'Garlic, raw',
          foodPortions: [
            {
              modifier: 'cloves',
              measureUnit: { name: 'undetermined' },
              amount: 3,
              gramWeight: 9,
              sequenceNumber: 3,
            },
            {
              portionDescription: '1 clove',
              measureUnit: { name: 'undetermined' },
              gramWeight: 3,
              sequenceNumber: 4,
            },
            {
              measureUnit: { name: 'undetermined' },
              gramWeight: 5,
              sequenceNumber: 5,
            },
            {
              measureUnit: { name: 'undetermined' },
              amount: 2,
              gramWeight: 6,
              sequenceNumber: 6,
            },
          ],
        }),
      );

      const detail = await service().getFood(169230);
      expect(detail?.portions).toEqual([
        { gramWeight: 9, description: 'cloves', amount: 3, sequenceNumber: 3 },
        { gramWeight: 3, description: '1 clove', amount: null, sequenceNumber: 4 },
        { gramWeight: 5, description: '', amount: null, sequenceNumber: 5 },
        // NUT-9 (§16 U15): no portionDescription, so the record's amount is kept.
        { gramWeight: 6, description: '', amount: 2, sequenceNumber: 6 },
      ]);
    });

    it('NUT-9 prefers `portionDescription` over `modifier` and still appends the unit', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 2709786,
          description: 'Garlic, raw',
          foodPortions: [
            {
              portionDescription: '1 clove',
              modifier: '10205',
              measureUnit: { name: 'clove' },
              amount: 1,
              gramWeight: 3,
              sequenceNumber: 1,
            },
          ],
        }),
      );

      const detail = await service().getFood(2709786);
      expect(detail?.portions).toEqual([
        {
          gramWeight: 3,
          description: '1 clove clove',
          amount: null,
          sequenceNumber: 1,
        },
      ]);
    });

    it('NUT-9 leaves a non-numeric `amount` or `sequenceNumber` null', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          fdcId: 169230,
          description: 'Garlic, raw',
          foodPortions: [
            { modifier: 'cloves', amount: '3', gramWeight: 9, sequenceNumber: 'x' },
          ],
        }),
      );

      const detail = await service().getFood(169230);
      expect(detail?.portions).toEqual([
        { gramWeight: 9, description: 'cloves', amount: null, sequenceNumber: null },
      ]);
    });

    it('NUT-5 returns null for a 404 food id', async () => {
      fetchMock.mockResolvedValue(statusResponse(404));

      await expect(service().getFood(999999999)).resolves.toBe(null);
    });

    it('NUT-6 answers a repeated food id from the cache', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ fdcId: 171705, description: 'Onions, raw' }),
      );
      const client = service();

      await client.getFood(171705);
      await client.getFood(171705);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('NUT-6 gives a food with no portions an empty portion list', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ fdcId: 171705, description: 'Onions, raw' }),
      );

      await expect(service().getFood(171705)).resolves.toEqual({
        fdcId: 171705,
        description: 'Onions, raw',
        kcalPer100g: null,
        portions: [],
      });
    });
  });
});

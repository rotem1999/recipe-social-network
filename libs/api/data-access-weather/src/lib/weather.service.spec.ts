// SPEC §8 WX-7..WX-10 (§16 W3, W4): the Open-Meteo client. `fetch` is mocked;
// the payload field names are Open-Meteo's documented ones. Open-Meteo needs no
// key, so nothing secret appears here.

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service';

/** §16 W3, W4: the verified Open-Meteo endpoints. */
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// SPEC §16 V16: @nestjs/config 12 ships ESM only while this Jest project is
// CommonJS (§11.1), and the unit under test imports ConfigService for DI. The
// module is mocked at its boundary so the unit loads; configuration still
// reaches it only through the explicit stub below.
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

function configStub(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as unknown as Response;
}

/** WX-9: one forward-geocoding hit. */
function geocodingBody() {
  return {
    results: [
      {
        name: 'Jerusalem',
        latitude: 31.76904,
        longitude: 35.21633,
        country: 'Israel',
        timezone: 'Asia/Jerusalem',
      },
    ],
  };
}

/** WX-10: the current block and today's sunrise/sunset. */
function forecastBody(weatherCode = 61, isDay = 1) {
  return {
    current: {
      time: '2026-09-28T18:00',
      temperature_2m: 18.4,
      is_day: isDay,
      weather_code: weatherCode,
    },
    daily: {
      sunrise: ['2026-09-28T06:31'],
      sunset: ['2026-09-28T18:44'],
    },
  };
}

describe('WeatherService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function service(values?: Record<string, string>): WeatherService {
    return new WeatherService(configStub(values));
  }

  it('WX-9 composes geocoding and forecast into one snapshot', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody(61, 1)));

    const snapshot = await service().weatherFor('Asia/Jerusalem');

    expect(snapshot).toMatchObject({
      city: 'Jerusalem',
      temperatureC: 18.4,
      isDay: true,
      condition: 'rain',
      weatherCode: 61,
    });
    expect(Number.isInteger(snapshot?.localHour)).toBe(true);
    expect(snapshot?.localHour).toBeGreaterThanOrEqual(0);
    expect(snapshot?.localHour).toBeLessThanOrEqual(23);
  });

  it('WX-9 asks Open-Meteo geocoding for the city of the timezone', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    await service().weatherFor('America/New_York');

    const geoUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${geoUrl.origin}${geoUrl.pathname}`).toBe(GEOCODING_URL);
    expect(geoUrl.searchParams.get('name')).toBe('New York');
    expect(geoUrl.searchParams.get('count')).toBe('10');
    expect(geoUrl.searchParams.get('language')).toBe('en');
  });

  it('WX-9 asks the forecast for the geocoded coordinates and the caller timezone', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    await service().weatherFor('Asia/Jerusalem');

    const url = new URL(String(fetchMock.mock.calls[1][0]));
    expect(`${url.origin}${url.pathname}`).toBe(FORECAST_URL);
    expect(url.searchParams.get('latitude')).toBe('31.76904');
    expect(url.searchParams.get('longitude')).toBe('35.21633');
    expect(url.searchParams.get('timezone')).toBe('Asia/Jerusalem');
    expect(url.searchParams.get('current')).toBe(
      'temperature_2m,is_day,weather_code',
    );
    expect(url.searchParams.get('daily')).toBe('sunrise,sunset');
  });

  it('WX-10 uses the configured Open-Meteo URLs when they are set', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    await service({
      OPENMETEO_GEOCODING_URL: 'https://geo.internal.test/v1/search',
      OPENMETEO_FORECAST_URL: 'https://forecast.internal.test/v1/forecast',
    }).weatherFor('Asia/Jerusalem');

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'https://geo.internal.test/v1/search',
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'https://forecast.internal.test/v1/forecast',
    );
  });

  it('WX-10 maps `is_day: 0` to night and the code to its word', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody(75, 0)));

    const snapshot = await service().weatherFor('Asia/Jerusalem');

    expect(snapshot?.isDay).toBe(false);
    expect(snapshot?.condition).toBe('snow');
  });

  it('WX-9 returns null for a timezone without a city segment and never calls Open-Meteo', async () => {
    await expect(service().weatherFor('UTC')).resolves.toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['Etc/UTC', 'Etc/GMT+2', 'GMT'])(
    'WX-9 returns null for %s and never calls Open-Meteo',
    async (timezone) => {
      await expect(service().weatherFor(timezone)).resolves.toBe(null);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('WX-9 ignores a geocoding hit whose name is not the city segment and asks no forecast', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            name: 'Atlanta',
            latitude: 33.749,
            longitude: -84.38798,
            country: 'United States',
            timezone: 'America/New_York',
          },
        ],
      }),
    );

    // The hit's zone is the request's zone, so only the name rule rejects it.
    await expect(service().weatherFor('America/New_York')).resolves.toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WX-9 geocode() returns null for a hit whose name differs from the city', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            name: 'Utrecht',
            latitude: 52.09083,
            longitude: 5.12222,
            country: 'Netherlands',
            timezone: 'Europe/Amsterdam',
          },
        ],
      }),
    );

    await expect(service().geocode('UTC', 'Europe/Amsterdam')).resolves.toBe(null);
  });

  it('WX-9 geocode() returns null for a hit without a name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          { latitude: 31.76904, longitude: 35.21633, timezone: 'Asia/Jerusalem' },
        ],
      }),
    );

    await expect(service().geocode('Jerusalem', 'Asia/Jerusalem')).resolves.toBe(null);
  });

  it('WX-9 accepts a hit whose name differs from the city only in letter case', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ ...geocodingBody().results[0], name: 'JERUSALEM' }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    const snapshot = await service().weatherFor('Asia/Jerusalem');

    expect(snapshot).toMatchObject({ city: 'JERUSALEM', condition: 'rain' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('WX-9 reads underscores as spaces when comparing the hit name to the city', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            name: 'New York',
            latitude: 40.71427,
            longitude: -74.00597,
            country: 'United States',
            timezone: 'America/New_York',
          },
        ],
      }),
    );

    await expect(service().geocode('New_York', 'America/New_York')).resolves.toMatchObject({
      name: 'New York',
      latitude: 40.71427,
    });
  });

  it('WX-9 accepts the New York hit for America/New_York', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              name: 'New York',
              latitude: 40.71427,
              longitude: -74.00597,
              country: 'United States',
              timezone: 'America/New_York',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    await expect(service().weatherFor('America/New_York')).resolves.toMatchObject(
      { city: 'New York' },
    );
  });

  /** WX-9: one Open-Meteo geocoding hit with the documented field names. */
  function hit(name: string, latitude: number, longitude: number, country: string, timezone: string) {
    return jsonResponse({
      results: [{ name, latitude, longitude, country, timezone }],
    });
  }

  const SAO_PAULO = (): Response =>
    hit('São Paulo', -23.5475, -46.63611, 'Brazil', 'America/Sao_Paulo');
  const BOGOTA = (): Response =>
    hit('Bogotá', 4.60971, -74.08175, 'Colombia', 'America/Bogota');
  const HO_CHI_MINH_CITY = (): Response =>
    hit('Ho Chi Minh City', 10.82302, 106.62965, 'Vietnam', 'Asia/Ho_Chi_Minh');

  it('WX-9 matches "São Paulo" to the segment Sao_Paulo, diacritics removed', async () => {
    fetchMock.mockResolvedValueOnce(SAO_PAULO());

    await expect(service().geocode('Sao_Paulo', 'America/Sao_Paulo')).resolves.toMatchObject({
      name: 'São Paulo',
      latitude: -23.5475,
      longitude: -46.63611,
    });
  });

  it('WX-9 matches "Bogotá" to the segment Bogota', async () => {
    fetchMock.mockResolvedValueOnce(BOGOTA());

    await expect(service().geocode('Bogota', 'America/Bogota')).resolves.toMatchObject({
      name: 'Bogotá',
    });
  });

  it('WX-9 removes diacritics from both sides of the comparison', async () => {
    fetchMock.mockResolvedValueOnce(
      hit('Bogota', 4.60971, -74.08175, 'Colombia', 'America/Bogota'),
    );

    await expect(service().geocode('Bogotá', 'America/Bogota')).resolves.toMatchObject({
      name: 'Bogota',
    });
  });

  it('WX-9 accepts a hit named after the segment followed by " City" (Ho_Chi_Minh)', async () => {
    fetchMock.mockResolvedValueOnce(HO_CHI_MINH_CITY());

    await expect(service().geocode('Ho_Chi_Minh', 'Asia/Ho_Chi_Minh')).resolves.toMatchObject({
      name: 'Ho Chi Minh City',
      latitude: 10.82302,
    });
  });

  it('WX-9 gives weather for America/Sao_Paulo named as Open-Meteo spells it', async () => {
    fetchMock
      .mockResolvedValueOnce(SAO_PAULO())
      .mockResolvedValueOnce(jsonResponse(forecastBody(95, 0)));

    const snapshot = await service().weatherFor('America/Sao_Paulo');

    expect(snapshot).toMatchObject({ city: 'São Paulo', condition: 'thunderstorm' });
    const forecastUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(forecastUrl.searchParams.get('latitude')).toBe('-23.5475');
  });

  it('WX-9 gives weather for Asia/Ho_Chi_Minh through the " City" hit', async () => {
    fetchMock
      .mockResolvedValueOnce(HO_CHI_MINH_CITY())
      .mockResolvedValueOnce(jsonResponse(forecastBody()));

    await expect(service().weatherFor('Asia/Ho_Chi_Minh')).resolves.toMatchObject({
      city: 'Ho Chi Minh City',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a different city with the same letters but for the diacritics', 'Sao_Paula', 'São Paulo'],
    ['" City" in front of the segment', 'Ho_Chi_Minh', 'City of Ho Chi Minh'],
    ['more than " City" after the segment', 'Ho_Chi_Minh', 'Ho Chi Minh City Centre'],
    ['a segment that only starts the hit name', 'Ho_Chi', 'Ho Chi Minh City'],
    ['" Town" instead of " City"', 'Ho_Chi_Minh', 'Ho Chi Minh Town'],
  ])('WX-9 rejects %s', async (_name, segment, hitName) => {
    fetchMock.mockResolvedValueOnce(hit(hitName, 10.82302, 106.62965, 'Vietnam', 'Asia/Ho_Chi_Minh'));

    await expect(service().geocode(segment, 'Asia/Ho_Chi_Minh')).resolves.toBe(null);
  });

  it('WX-9 the " City" rule does not let UTC resolve to Utrecht', async () => {
    fetchMock.mockResolvedValueOnce(
      hit('Utrecht', 52.09083, 5.12222, 'Netherlands', 'Europe/Amsterdam'),
    );

    await expect(service().geocode('UTC', 'Europe/Amsterdam')).resolves.toBe(null);
  });

  /** WX-9: one Open-Meteo geocoding result with the documented field names. */
  function result(name: string, latitude: number, longitude: number, country: string, timezone: string) {
    return { name, latitude, longitude, country, timezone };
  }

  const CALCUTTA_SOUTH_AFRICA = result('Calcutta', -24.99, 31.21, 'South Africa', 'Africa/Johannesburg');
  const KOLKATA = result('Kolkata', 22.56263, 88.36304, 'India', 'Asia/Kolkata');

  describe('WX-9 zone match (BUG-029)', () => {
    it('WX-9 rejects Calcutta, South Africa for the zone Asia/Calcutta', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: [CALCUTTA_SOUTH_AFRICA] }));

      await expect(service().geocode('Calcutta', 'Asia/Calcutta')).resolves.toBe(null);
    });

    it('WX-9 accepts Calcutta, South Africa for the zone Africa/Johannesburg', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: [CALCUTTA_SOUTH_AFRICA] }));

      await expect(
        service().geocode('Calcutta', 'Africa/Johannesburg'),
      ).resolves.toEqual({
        name: 'Calcutta',
        latitude: -24.99,
        longitude: 31.21,
        country: 'South Africa',
        timezone: 'Africa/Johannesburg',
      });
    });

    it('WX-9 skips earlier hits in another zone and uses the first hit in the request zone', async () => {
      const second = result('Kolkata', 22.5, 88.3, 'India', 'Asia/Kolkata');
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          results: [
            result('Kolkata', 1, 2, 'Nowhere', 'Africa/Johannesburg'),
            KOLKATA,
            second,
          ],
        }),
      );

      await expect(service().geocode('Kolkata', 'Asia/Kolkata')).resolves.toMatchObject({
        name: 'Kolkata',
        latitude: 22.56263,
        longitude: 88.36304,
      });
    });

    it('WX-9 needs the name and the zone to pass on the same hit', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          results: [
            CALCUTTA_SOUTH_AFRICA,
            result('Howrah', 22.57688, 88.31857, 'India', 'Asia/Kolkata'),
          ],
        }),
      );

      await expect(service().geocode('Calcutta', 'Asia/Calcutta')).resolves.toBe(null);
    });

    it.each([
      ['Asia/Calcutta', 'Asia/Kolkata'],
      ['Asia/Kolkata', 'Asia/Calcutta'],
      ['asia/kolkata', 'Asia/Kolkata'],
    ])(
      'WX-9 treats the request zone %s and the hit zone %s as the same zone through Intl',
      async (requestZone, hitZone) => {
        fetchMock.mockResolvedValueOnce(
          jsonResponse({ results: [{ ...KOLKATA, timezone: hitZone }] }),
        );

        await expect(service().geocode('Kolkata', requestZone)).resolves.toMatchObject({
          name: 'Kolkata',
        });
      },
    );

    it('WX-9 rejects a hit that carries no timezone', async () => {
      const withoutZone: Partial<typeof KOLKATA> = { ...KOLKATA };
      delete withoutZone.timezone;
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: [withoutZone] }));

      await expect(service().geocode('Kolkata', 'Asia/Kolkata')).resolves.toBe(null);
    });

    it('WX-9 rejects a hit whose timezone Intl does not know', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ ...KOLKATA, timezone: 'Asia/Atlantis' }] }),
      );

      await expect(service().geocode('Kolkata', 'Asia/Kolkata')).resolves.toBe(null);
    });

    it('WX-9 has no weather context when the request zone is one Intl does not know', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ ...KOLKATA, name: 'Atlantis', timezone: 'Asia/Atlantis' }] }),
      );

      await expect(service().geocode('Atlantis', 'Asia/Atlantis')).resolves.toBe(null);
    });

    it('WX-9 gives no weather context and asks no forecast when no hit is in the request zone', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ ...KOLKATA, timezone: 'Asia/Dhaka' }] }),
      );

      await expect(service().weatherFor('Asia/Kolkata')).resolves.toBe(null);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('WX-9 legacy zone names (BUG-029)', () => {
    it.each([
      ['Asia/Calcutta', 'Kolkata', KOLKATA],
      ['Europe/Kiev', 'Kyiv', result('Kyiv', 50.45466, 30.5238, 'Ukraine', 'Europe/Kyiv')],
      [
        'Asia/Saigon',
        'Ho Chi Minh',
        result('Ho Chi Minh City', 10.82302, 106.62965, 'Vietnam', 'Asia/Ho_Chi_Minh'),
      ],
      ['America/Godthab', 'Nuuk', result('Nuuk', 64.18347, -51.72157, 'Greenland', 'America/Nuuk')],
      [
        'Asia/Katmandu',
        'Kathmandu',
        result('Kathmandu', 27.70169, 85.3206, 'Nepal', 'Asia/Kathmandu'),
      ],
      ['Asia/Rangoon', 'Yangon', result('Yangon', 16.80528, 96.15611, 'Myanmar', 'Asia/Yangon')],
      [
        'Atlantic/Faeroe',
        'Tórshavn',
        result('Tórshavn', 62.00973, -6.77164, 'Faroe Islands', 'Atlantic/Faroe'),
      ],
      [
        'Atlantic/Faroe',
        'Tórshavn',
        result('Tórshavn', 62.00973, -6.77164, 'Faroe Islands', 'Atlantic/Faroe'),
      ],
    ])(
      'WX-9 geocodes %s by its current city name %s and gives weather for it',
      async (zone, cityName, geocodingResult) => {
        fetchMock
          .mockResolvedValueOnce(jsonResponse({ results: [geocodingResult] }))
          .mockResolvedValueOnce(jsonResponse(forecastBody()));

        const snapshot = await service().weatherFor(zone);

        const geoUrl = new URL(String(fetchMock.mock.calls[0][0]));
        expect(geoUrl.searchParams.get('name')).toBe(cityName);
        expect(geoUrl.searchParams.get('count')).toBe('10');
        expect(snapshot).toMatchObject({ city: geocodingResult.name });
        const forecastUrl = new URL(String(fetchMock.mock.calls[1][0]));
        expect(forecastUrl.searchParams.get('timezone')).toBe(zone);
        expect(forecastUrl.searchParams.get('latitude')).toBe(
          String(geocodingResult.latitude),
        );
      },
    );

    it('WX-9 rejects Calcutta, South Africa when the legacy zone Asia/Calcutta asks for Kolkata', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ ...CALCUTTA_SOUTH_AFRICA, name: 'Kolkata' }] }),
      );

      await expect(service().weatherFor('Asia/Calcutta')).resolves.toBe(null);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('WX-10 geocoding cache (BUG-029)', () => {
    it('WX-10 caches a geocoding answer with no matching hit, so the null is not asked again', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [CALCUTTA_SOUTH_AFRICA] }));
      const client = service();

      await expect(client.geocode('Calcutta', 'Asia/Calcutta')).resolves.toBe(null);
      await expect(client.geocode('Calcutta', 'Asia/Calcutta')).resolves.toBe(null);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('WX-10 caches an empty geocoding answer through weatherFor as well', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));
      const client = service();

      await expect(client.weatherFor('Asia/Atlantis')).resolves.toBe(null);
      await expect(client.weatherFor('Asia/Atlantis')).resolves.toBe(null);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('WX-10 asks again for a cached null once the 30 minutes have passed', async () => {
      const start = Date.UTC(2026, 8, 30, 12, 0, 0);
      let now = start;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      fetchMock.mockResolvedValue(jsonResponse({ results: [CALCUTTA_SOUTH_AFRICA] }));
      const client = service();

      await client.geocode('Calcutta', 'Asia/Calcutta');
      now = start + 30 * 60 * 1000 + 1;
      await client.geocode('Calcutta', 'Asia/Calcutta');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('WX-10 keeps a separate entry per zone, so a null for one zone does not hide the city in another', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [CALCUTTA_SOUTH_AFRICA] }));
      const client = service();

      await expect(client.geocode('Calcutta', 'Asia/Calcutta')).resolves.toBe(null);
      await expect(
        client.geocode('Calcutta', 'Africa/Johannesburg'),
      ).resolves.toMatchObject({ name: 'Calcutta' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('WX-10 shares one entry between a legacy zone name and its current name', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [KOLKATA] }))
        .mockResolvedValueOnce(jsonResponse(forecastBody()));
      const client = service();

      const legacy = await client.weatherFor('Asia/Calcutta');
      const current = await client.weatherFor('Asia/Kolkata');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(legacy).toMatchObject({ city: 'Kolkata' });
      expect(current).toMatchObject({ city: 'Kolkata' });
    });
  });

  it('WX-10 returns null when Open-Meteo geocodes no result', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    await expect(service().weatherFor('Asia/Atlantis')).resolves.toBe(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WX-10 returns null when Open-Meteo is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service().weatherFor('Asia/Jerusalem')).resolves.toBe(null);
  });

  it('WX-10 returns null when the geocoding answer is a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({}),
    } as unknown as Response);

    await expect(service().weatherFor('Asia/Jerusalem')).resolves.toBe(null);
  });

  it('WX-10 returns null when the forecast carries no current block', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse({ daily: {} }));

    await expect(service().weatherFor('Asia/Jerusalem')).resolves.toBe(null);
  });

  it('WX-10 serves a second call within the 30-minute TTL from the cache', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));
    const client = service();

    const first = await client.weatherFor('Asia/Jerusalem');
    const second = await client.weatherFor('Asia/Jerusalem');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it('WX-10 geocodes again once the 30-minute cache entry has expired', async () => {
    const start = Date.UTC(2026, 8, 28, 12, 0, 0);
    let now = start;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()))
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));
    const client = service();

    await client.weatherFor('Asia/Jerusalem');
    now = start + 30 * 60 * 1000 + 1;
    await client.weatherFor('Asia/Jerusalem');

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('WX-10 does not cache a failed geocoding lookup', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(geocodingBody()))
      .mockResolvedValueOnce(jsonResponse(forecastBody()));
    const client = service();

    await expect(client.weatherFor('Asia/Jerusalem')).resolves.toBe(null);
    await expect(client.weatherFor('Asia/Jerusalem')).resolves.toMatchObject({
      city: 'Jerusalem',
    });
  });

  it('WX-9 exposes sunrise and sunset from the daily block', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(forecastBody()));

    const weather = await service().currentWeather(
      {
        name: 'Jerusalem',
        latitude: 31.76904,
        longitude: 35.21633,
        country: 'Israel',
        timezone: 'Asia/Jerusalem',
      },
      'Asia/Jerusalem',
    );

    expect(weather).toEqual({
      temperatureC: 18.4,
      isDay: true,
      weatherCode: 61,
      condition: 'rain',
      sunrise: '2026-09-28T06:31',
      sunset: '2026-09-28T18:44',
      observedAt: '2026-09-28T18:00',
    });
  });
});

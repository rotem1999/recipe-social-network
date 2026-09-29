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
    expect(geoUrl.searchParams.get('count')).toBe('1');
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

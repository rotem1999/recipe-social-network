import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { cityFromTimezone } from './city-from-timezone';
import type {
  CurrentWeather,
  GeoLocation,
  WeatherSnapshot,
} from './weather.types';
import { conditionFromWmoCode } from './wmo-codes';

/** WX-7: verified Open-Meteo endpoints (SPEC §16 W3, W4); used when unset in env. */
const DEFAULT_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const DEFAULT_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** WX-10: geocoding and forecast results are cached in memory for 30 minutes per city. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Open-Meteo has no key and can be slow; never hold a recommendation longer than this. */
const REQUEST_TIMEOUT_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface GeocodingResult {
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  timezone?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

interface ForecastResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    is_day?: number;
    weather_code?: number;
  };
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
}

/**
 * Open-Meteo client (SPEC §8, WX-7..WX-10). No API key; the free tier is
 * non-commercial and requires CC-BY 4.0 attribution in the UI (SPEC §16 W1).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly geoCache = new Map<string, CacheEntry<GeoLocation | null>>();
  private readonly weatherCache = new Map<string, CacheEntry<CurrentWeather>>();

  constructor(private readonly config: ConfigService) {}

  /**
   * WX-10: weather context for one IANA timezone, or null when there is no
   * city segment, the city cannot be geocoded, or Open-Meteo is unreachable —
   * recommendations must still work without weather.
   */
  async weatherFor(timezone: string): Promise<WeatherSnapshot | null> {
    const city = cityFromTimezone(timezone);
    if (city === null) {
      this.logger.warn(`Timezone "${timezone}" carries no city segment`);
      return null;
    }

    try {
      const location = await this.geocode(city);
      if (location === null) return null;

      const weather = await this.readCurrentWeatherCached(
        city,
        location,
        timezone,
      );
      if (weather === null) return null;

      return {
        city: location.name,
        temperatureC: weather.temperatureC,
        isDay: weather.isDay,
        condition: weather.condition,
        weatherCode: weather.weatherCode,
        localHour: localHourIn(timezone),
      };
    } catch (error) {
      this.logger.warn(
        `Weather lookup failed for "${timezone}": ${describe(error)}`,
      );
      return null;
    }
  }

  /**
   * WX-9: forward geocoding, city name → coordinates. Null when Open-Meteo
   * returns no hit, or a hit whose `name` is not the city itself (compared
   * case-insensitively, underscores as spaces), so a fuzzy match such as
   * "UTC" → Utrecht never becomes weather context (BUG-017). Cached per city
   * for 30 minutes (WX-10).
   */
  async geocode(city: string): Promise<GeoLocation | null> {
    const key = city.toLowerCase();
    const cached = readCache(this.geoCache, key);
    if (cached !== undefined) return cached;

    const url = new URL(this.geocodingUrl());
    url.searchParams.set('name', city);
    url.searchParams.set('count', '1');
    url.searchParams.set('language', 'en');

    const body = await this.getJson<GeocodingResponse>(url);
    const hit = body?.results?.[0];
    const matches =
      hit !== undefined &&
      typeof hit.name === 'string' &&
      sameCityName(hit.name, city);
    if (hit !== undefined && !matches) {
      this.logger.warn(
        `Open-Meteo geocoded "${city}" to "${String(hit.name)}"; no weather context`,
      );
    }
    const location: GeoLocation | null =
      hit === undefined ||
      !matches ||
      typeof hit.name !== 'string' ||
      typeof hit.latitude !== 'number' ||
      typeof hit.longitude !== 'number'
        ? null
        : {
            name: hit.name,
            latitude: hit.latitude,
            longitude: hit.longitude,
            country: hit.country ?? '',
            timezone: hit.timezone ?? '',
          };

    // A failed request is not cached: body === null means Open-Meteo was
    // unreachable, not that the city is unknown.
    if (body !== null) writeCache(this.geoCache, key, location);
    return location;
  }

  /** WX-9: current conditions plus today's sunrise and sunset for one location. */
  async currentWeather(
    location: GeoLocation,
    timezone: string,
  ): Promise<CurrentWeather> {
    const url = new URL(this.forecastUrl());
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set('timezone', timezone);
    url.searchParams.set('current', 'temperature_2m,is_day,weather_code');
    url.searchParams.set('daily', 'sunrise,sunset');
    url.searchParams.set('forecast_days', '1');

    const body = await this.getJson<ForecastResponse>(url);
    const current = body?.current;
    if (
      current === undefined ||
      typeof current.temperature_2m !== 'number' ||
      typeof current.weather_code !== 'number'
    ) {
      throw new Error('Open-Meteo returned no current weather');
    }

    const weatherCode = current.weather_code;
    return {
      temperatureC: current.temperature_2m,
      isDay: current.is_day === 1,
      weatherCode,
      condition: conditionFromWmoCode(weatherCode),
      sunrise: body?.daily?.sunrise?.[0] ?? '',
      sunset: body?.daily?.sunset?.[0] ?? '',
      observedAt: current.time ?? '',
    };
  }

  /** WX-10: 30-minute in-memory weather cache, keyed by city. */
  private async readCurrentWeatherCached(
    city: string,
    location: GeoLocation,
    timezone: string,
  ): Promise<CurrentWeather | null> {
    const key = city.toLowerCase();
    const cached = readCache(this.weatherCache, key);
    if (cached !== undefined) return cached;

    const weather = await this.currentWeather(location, timezone);
    writeCache(this.weatherCache, key, weather);
    return weather;
  }

  /** Global fetch (no axios), 10 s timeout; null on network or non-2xx errors. */
  private async getJson<T>(url: URL): Promise<T | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        this.logger.warn(
          `Open-Meteo ${url.pathname} returned ${response.status} ${response.statusText}`,
        );
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(
        `Open-Meteo ${url.pathname} request failed: ${describe(error)}`,
      );
      return null;
    }
  }

  private geocodingUrl(): string {
    return (
      this.config.get<string>('OPENMETEO_GEOCODING_URL') ??
      DEFAULT_GEOCODING_URL
    );
  }

  private forecastUrl(): string {
    return (
      this.config.get<string>('OPENMETEO_FORECAST_URL') ?? DEFAULT_FORECAST_URL
    );
  }
}

/** WX-10: local hour of the day in the caller's timezone. */
function localHourIn(timezone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  }).format(new Date());
  // Some ICU versions render midnight as "24" under hour12:false.
  return Number(hour) % 24;
}

/** WX-9: a geocoding hit names the city segment itself, ignoring case and underscores. */
function sameCityName(hitName: string, city: string): boolean {
  const normalise = (value: string): string =>
    value.replace(/_/g, ' ').trim().toLowerCase();
  return normalise(hitName) === normalise(city);
}

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | undefined {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

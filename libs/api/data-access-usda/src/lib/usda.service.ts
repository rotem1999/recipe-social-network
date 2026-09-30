import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  UsdaDataType,
  UsdaFoodDetail,
  UsdaFoodHit,
  UsdaFoodPortion,
} from './usda.types';

/** Base used when USDA_FDC_BASE_URL is unset; the value SPEC §9 verified. */
const DEFAULT_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

/** NUT-6: USDA responses are cached in memory for 24 hours. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 15_000;

/** NUT-8: 25 hits give the food choice enough candidates to rank. */
const SEARCH_PAGE_SIZE = 25;

/**
 * SPEC §9: energy is nutrient 1008 (kcal), then 2047 and 2048 (Atwater kcal on
 * Foundation Foods). 1062 is kJ and is never read; a missing id means
 * unavailable (NUT-5), never zero.
 */
const ENERGY_NUTRIENT_IDS = [1008, 2047, 2048] as const;

interface CacheEntry<T> {
  storedAt: number;
  value: T;
}

type FetchOutcome = { found: false } | { found: true; body: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * SPEC §9: reads energy per 100 g from `foodNutrients[]`. Search results carry
 * the id as `nutrientId` (value in `value`), food details as `nutrient.id`
 * (value in `amount`); both shapes are accepted.
 */
function readKcalPer100g(foodNutrients: unknown): number | null {
  const entries = asArray(foodNutrients);
  for (const wantedId of ENERGY_NUTRIENT_IDS) {
    for (const entry of entries) {
      const record = asRecord(entry);
      if (record === null) {
        continue;
      }
      const nested = asRecord(record['nutrient']);
      const nutrientId =
        asFiniteNumber(record['nutrientId']) ??
        (nested === null ? null : asFiniteNumber(nested['id']));
      if (nutrientId !== wantedId) {
        continue;
      }
      const amount =
        asFiniteNumber(record['value']) ?? asFiniteNumber(record['amount']);
      if (amount !== null) {
        return amount;
      }
    }
  }
  return null;
}

/**
 * NUT-6: `foodMeasures[0].gramWeight`. The field is undocumented in the FDC
 * OpenAPI schema for search results, so its absence is tolerated.
 */
function readFirstMeasureGramWeight(foodMeasures: unknown): number | null {
  const first = asRecord(asArray(foodMeasures)[0]);
  return first === null ? null : asFiniteNumber(first['gramWeight']);
}

/**
 * NUT-6, NUT-9: `foodPortions[]`, described by `portionDescription` or else
 * `modifier`, followed by `measureUnit.name` unless it is "undetermined"
 * (Foundation foods name the unit there: "egg", "RACC").
 */
function readPortions(foodPortions: unknown): UsdaFoodPortion[] {
  const portions: UsdaFoodPortion[] = [];
  for (const entry of asArray(foodPortions)) {
    const record = asRecord(entry);
    if (record === null) {
      continue;
    }
    const gramWeight = asFiniteNumber(record['gramWeight']);
    if (gramWeight === null) {
      continue;
    }
    // NUT-9 (§16 U14, U15): FNDDS text is in portionDescription and its amount
    // is undefined; SR Legacy text is in modifier and Foundation text may be
    // the unit alone ("0.2 cup"), both with the count in amount.
    const portionDescription = asText(record['portionDescription']);
    const modifier = asText(record['modifier']);
    const unitRecord = asRecord(record['measureUnit']);
    const unitName = unitRecord === null ? '' : asText(unitRecord['name']);
    const description = [
      portionDescription || modifier,
      unitName.toLowerCase() === 'undetermined' ? '' : unitName,
    ]
      .filter((part) => part !== '')
      .join(' ');
    portions.push({
      gramWeight,
      description,
      amount:
        portionDescription === ''
          ? asFiniteNumber(record['amount'])
          : null,
      sequenceNumber: asFiniteNumber(record['sequenceNumber']),
    });
  }
  return portions;
}

function toFoodHit(raw: unknown): UsdaFoodHit | null {
  const record = asRecord(raw);
  if (record === null) {
    return null;
  }
  const fdcId = asFiniteNumber(record['fdcId']);
  if (fdcId === null) {
    return null;
  }
  return {
    fdcId,
    description: asText(record['description']),
    dataType: asText(record['dataType']),
    kcalPer100g: readKcalPer100g(record['foodNutrients']),
    gramWeightPerMeasure: readFirstMeasureGramWeight(record['foodMeasures']),
  };
}

/**
 * NUT-2, NUT-6: the only FoodData Central client. Holds the base URL and the
 * API key, searches foods and reads food details, and caches every response in
 * memory for 24 hours.
 */
@Injectable()
export class UsdaService {
  private readonly searchCache = new Map<string, CacheEntry<UsdaFoodHit[]>>();
  private readonly foodCache = new Map<
    string,
    CacheEntry<UsdaFoodDetail | null>
  >();

  constructor(private readonly config: ConfigService) {}

  /**
   * NUT-6: `POST /foods/search` with a JSON body (a GET with a `dataType`
   * filter returns 400). Returns at most 25 hits in USDA's order. The query is
   * sent as given, so it may carry search operators such as `+word` (NUT-8).
   */
  async searchFoods(
    query: string,
    dataTypes: UsdaDataType[],
  ): Promise<UsdaFoodHit[]> {
    const key = `search:${query}|${[...dataTypes].join(',')}`;
    const cached = this.readCache(this.searchCache, key);
    if (cached !== undefined) {
      return cached.value;
    }

    const outcome = await this.request('/foods/search', false, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        dataType: dataTypes,
        pageSize: SEARCH_PAGE_SIZE,
        pageNumber: 1,
      }),
    });
    if (!outcome.found) {
      return [];
    }

    const body = asRecord(outcome.body);
    const foods = body === null ? [] : asArray(body['foods']);
    const hits: UsdaFoodHit[] = [];
    for (const food of foods) {
      const hit = toFoodHit(food);
      if (hit !== null) {
        hits.push(hit);
      }
    }

    this.searchCache.set(key, { storedAt: Date.now(), value: hits });
    return hits;
  }

  /**
   * NUT-6: `GET /food/{fdcId}`, the source of `foodPortions[].gramWeight` for
   * the `piece` unit and for meal-mode portions. Unknown ids yield null.
   */
  async getFood(fdcId: number): Promise<UsdaFoodDetail | null> {
    const key = `food:${fdcId}`;
    const cached = this.readCache(this.foodCache, key);
    if (cached !== undefined) {
      return cached.value;
    }

    const outcome = await this.request(
      `/food/${encodeURIComponent(String(fdcId))}`,
      true,
      { method: 'GET' },
    );

    let detail: UsdaFoodDetail | null = null;
    if (outcome.found) {
      const record = asRecord(outcome.body);
      if (record !== null) {
        detail = {
          fdcId: asFiniteNumber(record['fdcId']) ?? fdcId,
          description: asText(record['description']),
          kcalPer100g: readKcalPer100g(record['foodNutrients']),
          portions: readPortions(record['foodPortions']),
        };
      }
    }

    this.foodCache.set(key, { storedAt: Date.now(), value: detail });
    return detail;
  }

  /** NUT-6: a cache entry counts only while it is younger than 24 hours. */
  private readCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
  ): CacheEntry<T> | undefined {
    const entry = cache.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (Date.now() - entry.storedAt >= CACHE_TTL_MS) {
      cache.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * SPEC §9: one request against FoodData Central with the key as `?api_key=`.
   * 429 (the 1,000 requests/hour limit) is surfaced as such; anything else that
   * fails, including a timeout, becomes a 503.
   */
  private async request(
    path: string,
    allowNotFound: boolean,
    init: RequestInit,
  ): Promise<FetchOutcome> {
    const apiKey = this.config.get<string>('USDA_FDC_KEY');
    if (apiKey === undefined || apiKey.trim() === '') {
      throw new ServiceUnavailableException('USDA key is not configured');
    }
    const baseUrl = (
      this.config.get<string>('USDA_FDC_BASE_URL') ?? DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
    const url = `${baseUrl}${path}?api_key=${encodeURIComponent(apiKey)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('USDA request failed');
    }

    if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
      throw new HttpException(
        'USDA rate limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (allowNotFound && response.status === HttpStatus.NOT_FOUND) {
      return { found: false };
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('USDA request failed');
    }

    try {
      return { found: true, body: (await response.json()) as unknown };
    } catch {
      throw new ServiceUnavailableException('USDA response was unreadable');
    }
  }
}

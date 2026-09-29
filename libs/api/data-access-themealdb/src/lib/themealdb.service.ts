// CAT-1, CAT-2, CAT-6 (§3.3): the only place TheMealDB's URL and key are used
// (libs/api/CLAUDE.md). v2 only — the client never falls back to v1 (§16 M8).

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Category } from '@rsn/shared/util-domain';
import { CatalogueItemDto } from '@rsn/shared/util-contracts';
import { MealCategoryRow, MealFilterRow, MealRecord } from './meal-record';
import { toCatalogueItem } from './mapper';

/** §3.3: a catalogue request is abandoned after 15 seconds. */
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class TheMealDbService {
  private readonly logger = new Logger(TheMealDbService.name);

  /** §16 M8: the non-array `meals` shape is logged once, not on every call. */
  private hasWarnedAboutNonArrayMeals = false;

  constructor(private readonly config: ConfigService) {}

  /** DISC-9, CAT-6: the catalogue entries of one category from `filter.php?c=`. */
  async listByCategory(category: Category): Promise<CatalogueItemDto[]> {
    const rows = await this.getMeals<MealFilterRow>(
      `filter.php?c=${encodeURIComponent(category)}`,
    );
    return rows.map((row) => toCatalogueItem(row, category));
  }

  /** CAT-6: the full meal object from `lookup.php?i=`, or null when it is unknown. */
  async lookup(mealId: string): Promise<MealRecord | null> {
    const meals = await this.getMeals<MealRecord>(
      `lookup.php?i=${encodeURIComponent(mealId)}`,
    );
    return meals[0] ?? null;
  }

  /** DISC-7: TheMealDB's own category names from `list.php?c=list`. */
  async listCategories(): Promise<string[]> {
    const rows = await this.getMeals<MealCategoryRow>('list.php?c=list');
    return rows
      .map((row) => (row.strCategory ?? '').trim())
      .filter((name) => name.length > 0);
  }

  /** CAT-1: `${THEMEALDB_BASE_URL}/${THEMEALDB_KEY}` — the v2 format of §3.3. */
  private baseUrl(): string {
    const key = this.config.get<string>('THEMEALDB_KEY')?.trim();
    if (!key)
      throw new ServiceUnavailableException('TheMealDB key is not configured');
    const base = this.config.get<string>('THEMEALDB_BASE_URL')?.trim();
    if (!base)
      throw new ServiceUnavailableException(
        'TheMealDB base URL is not configured',
      );
    return `${base.replace(/\/+$/, '')}/${key}`;
  }

  /**
   * §3.3: global fetch, 15 s timeout, ServiceUnavailableException on a non-2xx
   * response or a network error, an empty list when `meals` is null. §16 M8: the
   * test key can answer with `meals` as an object instead of an array; that shape
   * is treated as empty and warned about once.
   */
  private async getMeals<T>(path: string): Promise<T[]> {
    // The URL carries the key, so only the path is ever logged.
    const url = `${this.baseUrl()}/${path}`;
    let body: unknown;
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `TheMealDB responded with status ${response.status}`,
        );
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        this.logger.error(`TheMealDB ${path} failed: ${error.message}`);
        throw error;
      }
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`TheMealDB ${path} failed: ${reason}`);
      throw new ServiceUnavailableException('TheMealDB is unavailable');
    }

    const meals = (body as { meals?: unknown } | null | undefined)?.meals;
    if (meals === null || meals === undefined) return [];
    if (!Array.isArray(meals)) {
      if (!this.hasWarnedAboutNonArrayMeals) {
        this.hasWarnedAboutNonArrayMeals = true;
        this.logger.warn(
          'TheMealDB returned "meals" as an object instead of an array (test-key shape, §16 M8); treating it as empty. Set a v2 premium key in THEMEALDB_KEY.',
        );
      }
      return [];
    }
    return meals as T[];
  }
}

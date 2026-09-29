import type { RecommendScope } from '@rsn/shared/util-contracts';

/** WX-10: a cached recommendation expires after 60 minutes. */
export const RECOMMEND_CACHE_TTL_MS = 60 * 60 * 1000;

/** WX-10: the part of a model answer that is cached; cards, weather and quota are read fresh. */
export interface CachedPick {
  id: string;
  reason: string;
}

/** WX-10: what identifies one cached answer for one user and scope. */
export interface RecommendCacheKeyInput {
  timezone: string;
  /** The weather word (WX-10), or null when there is no weather context. */
  condition: string | null;
  /** The exact candidate ids sent to the model, in the order sent. */
  candidateIds: readonly string[];
  /** WX-5 "Show another": the excluded recipe ids; absent or empty for the plain request. */
  excludedIds?: readonly string[];
}

interface Entry {
  key: string;
  picks: CachedPick[];
  expiresAt: number;
}

/**
 * WX-10 (Rotem, chat 2026-09-30: "cache them"): the last recommendation per
 * user and scope, kept in memory. A lookup hits only when the key (local date
 * and hour from `timezone`, the weather word and the exact candidate id list)
 * matches and the entry is younger than 60 minutes. The answer to a request
 * without exclusions and a "Show another" answer (WX-5) live in separate
 * slots, so Show another never replaces the plain answer (PERF-003); the
 * Show-another slot's key carries its exclusions. Two slots per user and
 * scope, so the map never grows past users × scopes × 2.
 */
export class RecommendCache {
  private readonly entries = new Map<string, Entry>();

  /**
   * The cached picks for this key, or undefined on a miss or an expired
   * entry; `excludedIds` picks the slot (empty: the plain answer).
   */
  get(
    userId: string,
    scope: RecommendScope,
    key: string,
    excludedIds: readonly string[] = [],
  ): CachedPick[] | undefined {
    const slot = slotOf(userId, scope, excludedIds);
    const entry = this.entries.get(slot);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(slot);
      return undefined;
    }
    return entry.key === key ? entry.picks : undefined;
  }

  /**
   * WX-10: the latest answer replaces whatever its slot held; a Show-another
   * answer (non-empty `excludedIds`) only ever replaces the Show-another slot.
   */
  set(
    userId: string,
    scope: RecommendScope,
    key: string,
    picks: CachedPick[],
    excludedIds: readonly string[] = [],
  ): void {
    this.entries.set(slotOf(userId, scope, excludedIds), {
      key,
      picks,
      expiresAt: Date.now() + RECOMMEND_CACHE_TTL_MS,
    });
  }
}

/**
 * WX-10: the cache key, or null when `timezone` is not a zone this runtime
 * knows (no local date and hour can be derived, so nothing is cached).
 */
export function recommendCacheKey(input: RecommendCacheKeyInput): string | null {
  const local = localDateAndHour(input.timezone);
  if (local === null) return null;
  const excluded = [...new Set(input.excludedIds ?? [])].sort();
  // WX-10 (PERF-003): a Show-another key also holds its exclusions; the plain
  // key keeps its three parts.
  return JSON.stringify(
    excluded.length === 0
      ? [local, input.condition, input.candidateIds]
      : [local, input.condition, input.candidateIds, excluded],
  );
}

/** WX-10 (PERF-003): the plain slot, or the Show-another slot when anything is excluded. */
function slotOf(
  userId: string,
  scope: RecommendScope,
  excludedIds: readonly string[],
): string {
  return excludedIds.length === 0
    ? `${userId}:${scope}`
    : `${userId}:${scope}:another`;
}

/** WX-10: `YYYY-MM-DDTHH` in the caller's timezone, or null for an unknown zone. */
function localDateAndHour(timezone: string): string | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
  } catch {
    // RangeError: the DTO rejects unknown zones (BUG-026); kept for other callers.
    return null;
  }
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  // Some ICU versions render midnight as "24" even under h23.
  const hour = String(Number(part('hour')) % 24).padStart(2, '0');
  return `${part('year')}-${part('month')}-${part('day')}T${hour}`;
}

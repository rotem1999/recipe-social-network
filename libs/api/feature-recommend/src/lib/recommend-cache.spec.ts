// SPEC §8 WX-10 (Rotem, chat 2026-09-30: "cache them"): the recommendation
// cache. Pure in-memory; the clock is Jest's fake clock.
import {
  RECOMMEND_CACHE_TTL_MS,
  RecommendCache,
  recommendCacheKey,
} from './recommend-cache';

const MINUTE = 60 * 1000;
const USER_A = '22222222-2222-4222-8222-222222222222';
const USER_B = '33333333-3333-4333-8333-333333333333';
const PICKS = [{ id: 'a', reason: 'warming' }];

describe('RecommendCache (WX-10)', () => {
  /** 10:00 local time in Asia/Jerusalem (UTC+3 on this date). */
  const T0 = new Date('2026-09-30T07:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(T0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('WX-10 entries expire after 60 minutes', () => {
    expect(RECOMMEND_CACHE_TTL_MS).toBe(60 * MINUTE);
  });

  it('WX-10 returns the stored picks for the same user, scope and key', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    expect(cache.get(USER_A, 'home', 'key-1')).toEqual(PICKS);
  });

  it('WX-10 still hits one millisecond before 60 minutes', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    jest.advanceTimersByTime(60 * MINUTE - 1);

    expect(cache.get(USER_A, 'home', 'key-1')).toEqual(PICKS);
  });

  it('WX-10 misses once 60 minutes have passed', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    jest.advanceTimersByTime(60 * MINUTE);

    expect(cache.get(USER_A, 'home', 'key-1')).toBeUndefined();
  });

  it('WX-10 an expired entry stays gone after the clock is set back', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    jest.advanceTimersByTime(61 * MINUTE);
    expect(cache.get(USER_A, 'home', 'key-1')).toBeUndefined();
    jest.setSystemTime(T0);

    expect(cache.get(USER_A, 'home', 'key-1')).toBeUndefined();
  });

  it('WX-10 misses on a different key', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    expect(cache.get(USER_A, 'home', 'key-2')).toBeUndefined();
  });

  it('WX-10 keeps separate entries per user and per scope', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);

    expect(cache.get(USER_B, 'home', 'key-1')).toBeUndefined();
    expect(cache.get(USER_A, 'discover', 'key-1')).toBeUndefined();
  });

  it('WX-10 the latest answer replaces the one held for that user and scope', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);
    cache.set(USER_A, 'home', 'key-2', [{ id: 'b', reason: 'lighter' }]);

    expect(cache.get(USER_A, 'home', 'key-1')).toBeUndefined();
    expect(cache.get(USER_A, 'home', 'key-2')).toEqual([
      { id: 'b', reason: 'lighter' },
    ]);
  });

  it('WX-10 a replacing answer starts a fresh 60 minutes', () => {
    const cache = new RecommendCache();
    cache.set(USER_A, 'home', 'key-1', PICKS);
    jest.advanceTimersByTime(40 * MINUTE);
    cache.set(USER_A, 'home', 'key-1', PICKS);

    jest.advanceTimersByTime(40 * MINUTE);

    expect(cache.get(USER_A, 'home', 'key-1')).toEqual(PICKS);
  });
});

describe('recommendCacheKey (WX-10)', () => {
  /** 10:10 local time in Asia/Jerusalem (UTC+3 on this date). */
  const T0 = new Date('2026-09-30T07:10:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(T0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function key(
    overrides: Partial<Parameters<typeof recommendCacheKey>[0]> = {},
  ): string | null {
    return recommendCacheKey({
      timezone: 'Asia/Jerusalem',
      condition: 'clear',
      candidateIds: ['a', 'b'],
      ...overrides,
    });
  }

  it('WX-10 gives the same key for the same hour, weather word and candidates', () => {
    const first = key();
    jest.setSystemTime(new Date(T0.getTime() + 45 * MINUTE)); // 10:55 local

    expect(first).not.toBeNull();
    expect(key()).toBe(first);
  });

  it('WX-10 changes the key with the local hour', () => {
    const first = key();
    jest.setSystemTime(new Date(T0.getTime() + 50 * MINUTE)); // 11:00 local

    expect(key()).not.toBe(first);
  });

  it('WX-10 changes the key with the local date at the same hour', () => {
    const first = key();
    jest.setSystemTime(new Date(T0.getTime() + 24 * 60 * MINUTE));

    expect(key()).not.toBe(first);
  });

  it('WX-10 reads the date and hour in the given timezone, not the zone name', () => {
    // Both zones are UTC+3 on 2026-09-30; Europe/London is UTC+1.
    expect(key({ timezone: 'Europe/Athens' })).toBe(key());
    expect(key({ timezone: 'Europe/London' })).not.toBe(key());
  });

  it('WX-10 changes the key with the weather word', () => {
    expect(key({ condition: 'rain' })).not.toBe(key());
    expect(key({ condition: null })).not.toBe(key());
  });

  it('WX-10 changes the key with the exact candidate list', () => {
    expect(key({ candidateIds: ['a', 'b', 'c'] })).not.toBe(key());
    expect(key({ candidateIds: ['a'] })).not.toBe(key());
    expect(key({ candidateIds: ['b', 'a'] })).not.toBe(key());
  });

  it('WX-10 returns null (never cached) for a timezone Intl does not know', () => {
    expect(key({ timezone: 'Mars/Olympus_Mons' })).toBeNull();
    expect(key({ timezone: 'Foo/Bar' })).toBeNull();
  });
});

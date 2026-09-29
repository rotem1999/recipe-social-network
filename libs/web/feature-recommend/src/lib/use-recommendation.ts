// SPEC.md §8 (WX-2, WX-4, WX-5, WX-10): one `POST /recommend` per scope, and a
// re-prompt that excludes everything already shown.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QuotaDto,
  RecommendScope,
  RecommendationDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';
import { ApiError, useApi, useTimezone } from '@rsn/web/data-access-api';

/**
 * WX-10: the model is asked for up to 3 ranked picks on Home (WX-4) and 1 on
 * Discover. A response with fewer picks than that means the candidate pool is
 * spent, so "Show another" has nothing left to ask for (WX-5).
 */
const WANTED_PICKS: Record<RecommendScope, number> = { home: 3, discover: 1 };

/** What a recommendation card needs to render itself. */
export interface RecommendationState {
  /** The pick on screen; `null` while loading and when the model returned none. */
  pick: RecommendationDto | null;
  weather: WeatherContextDto | null;
  quota: QuotaDto | null;
  loading: boolean;
  /** "No recommendation right now", the 429 line, or an API error message. */
  message: string | null;
  /** WX-5: whether another alternative can still be asked for. */
  canShowAnother: boolean;
  showAnother: () => void;
}

/**
 * Runs the §8 recommendation for one scope. `onWeather` receives the weather
 * context of every response (WX-2: the home greeting carries the weather line).
 */
export function useRecommendation(
  scope: RecommendScope,
  onWeather?: (weather: WeatherContextDto | null) => void,
): RecommendationState {
  const api = useApi();
  // WX-8/WX-9: the OS timezone is the only location the app sends.
  const timezone = useTimezone();

  const [pick, setPick] = useState<RecommendationDto | null>(null);
  const [weather, setWeather] = useState<WeatherContextDto | null>(null);
  const [quota, setQuota] = useState<QuotaDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // WX-5: every id already shown is excluded from the next prompt.
  const shownIds = useRef<string[]>([]);
  // Kept in a ref so a new callback identity never re-runs the request.
  const onWeatherRef = useRef(onWeather);
  onWeatherRef.current = onWeather;

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await api.recommend({
        timezone,
        scope,
        excludeRecipeIds:
          shownIds.current.length > 0 ? [...shownIds.current] : undefined,
      });
      setWeather(response.weather);
      onWeatherRef.current?.(response.weather);
      setQuota(response.quota);
      setExhausted(response.picks.length < WANTED_PICKS[scope]);

      const next = response.picks[0] ?? null;
      if (next === null) {
        // WX-10: a non-JSON answer or an empty candidate list lands here.
        setMessage('No recommendation right now');
      } else {
        shownIds.current = [...shownIds.current, next.recipe.id];
        setPick(next);
      }
    } catch (cause) {
      // COOK-8: cook mode and recommendations share one daily quota.
      setMessage(
        cause instanceof ApiError && cause.status === 429
          ? 'Daily AI limit reached'
          : cause instanceof Error
            ? cause.message
            : 'No recommendation right now',
      );
    } finally {
      setLoading(false);
    }
  }, [api, scope, timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  const showAnother = useCallback((): void => {
    void load();
  }, [load]);

  return {
    pick,
    weather,
    quota,
    loading,
    message,
    canShowAnother:
      !loading && !exhausted && (quota === null || quota.remaining > 0),
    showAnother,
  };
}

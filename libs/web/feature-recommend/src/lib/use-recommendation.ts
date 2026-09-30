// SPEC.md §8 (WX-2, WX-4, WX-5, WX-10) and UI-18: one `POST /recommend` per
// scope, the ranked picks shown together, and a re-prompt that excludes
// everything already shown.
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
  /** UI-18: the latest response's picks, best first; empty while loading and when the model returned none. */
  picks: RecommendationDto[];
  weather: WeatherContextDto | null;
  quota: QuotaDto | null;
  loading: boolean;
  /** "No recommendation right now" (no pick at all), the 429 line, or an API error message. */
  message: string | null;
  /** UI-18: the muted "No other suggestions right now" after an empty re-prompt; the picks stay. */
  notice: string | null;
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

  const [picks, setPicks] = useState<RecommendationDto[]>([]);
  const [weather, setWeather] = useState<WeatherContextDto | null>(null);
  const [quota, setQuota] = useState<QuotaDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);

  // WX-5: every id already shown is excluded from the next prompt.
  const shownIds = useRef<string[]>([]);
  // Kept in a ref so a new callback identity never re-runs the request.
  const onWeatherRef = useRef(onWeather);
  onWeatherRef.current = onWeather;
  // UI-18: only the latest request may change the card, so an answer that
  // arrives after a newer request (or after unmount) never mixes its picks or
  // message into the list on screen.
  const latestRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const requestId = ++latestRequest.current;
    const isStale = (): boolean => requestId !== latestRequest.current;
    setLoading(true);
    setMessage(null);
    setNotice(null);
    const hadPicks = shownIds.current.length > 0;
    try {
      const response = await api.recommend({
        timezone,
        scope,
        excludeRecipeIds: hadPicks ? [...shownIds.current] : undefined,
      });
      if (isStale()) {
        return;
      }
      setWeather(response.weather);
      onWeatherRef.current?.(response.weather);
      setQuota(response.quota);
      setExhausted(response.picks.length < WANTED_PICKS[scope]);

      if (response.picks.length > 0) {
        shownIds.current = [
          ...shownIds.current,
          ...response.picks.map((next) => next.recipe.id),
        ];
        setPicks(response.picks);
      } else if (hadPicks) {
        // UI-18: an empty re-prompt keeps the list already on screen.
        setNotice('No other suggestions right now');
      } else {
        // WX-10: a non-JSON answer or an empty candidate list lands here.
        setMessage('No recommendation right now');
      }
    } catch (cause) {
      if (isStale()) {
        return;
      }
      // UI-18: with picks on screen a rejected re-prompt reads like an empty one,
      // so "No recommendation right now" never sits next to picks.
      if (hadPicks && cause instanceof ApiError && cause.status === 400) {
        setNotice('No other suggestions right now');
        return;
      }
      // COOK-8: cook mode and recommendations share one daily quota.
      // UI-43: a 400 (e.g. a rejected timezone) never shows its validator text.
      setMessage(
        cause instanceof ApiError && cause.status === 429
          ? 'Daily AI limit reached'
          : cause instanceof ApiError && cause.status === 400
            ? 'No recommendation right now'
            : cause instanceof Error
              ? cause.message
              : 'No recommendation right now',
      );
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [api, scope, timezone]);

  useEffect(() => {
    void load();
    return () => {
      latestRequest.current += 1;
    };
  }, [load]);

  const showAnother = useCallback((): void => {
    void load();
  }, [load]);

  return {
    picks,
    weather,
    quota,
    loading,
    message,
    notice,
    canShowAnother:
      !loading && !exhausted && (quota === null || quota.remaining > 0),
    showAnother,
  };
}

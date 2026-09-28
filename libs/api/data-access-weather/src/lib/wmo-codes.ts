import type { WeatherCondition } from './weather.types';

/**
 * WX-10: WMO weather interpretation code → the condition word sent to the model.
 * Ranges are Open-Meteo's documented WMO code table (SPEC §16 W3).
 */
export function conditionFromWmoCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'thunderstorm';
  // Open-Meteo never returns a code outside the table above; treat anything
  // unexpected as the neutral word rather than failing the recommendation.
  return 'cloudy';
}

/**
 * Public shapes of the Open-Meteo client (SPEC §8, WX-7..WX-10).
 */

/** WMO weather code mapped to the words WX-10 lists. */
export type WeatherCondition =
  'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';

/** One Open-Meteo geocoding hit (WX-9: city name → coordinates). */
export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  timezone: string;
}

/** Current conditions for one location (WX-9). */
export interface CurrentWeather {
  temperatureC: number;
  isDay: boolean;
  weatherCode: number;
  condition: WeatherCondition;
  /** Local ISO time of today's sunrise, as Open-Meteo returns it. */
  sunrise: string;
  /** Local ISO time of today's sunset, as Open-Meteo returns it. */
  sunset: string;
  /** Local ISO time of the observation, as Open-Meteo returns it. */
  observedAt: string;
}

/** Weather context handed to the recommendation prompt (WX-10). */
export interface WeatherSnapshot {
  city: string;
  temperatureC: number;
  isDay: boolean;
  condition: WeatherCondition;
  weatherCode: number;
  /** Hour of the day (0–23) in the caller's timezone. */
  localHour: number;
}

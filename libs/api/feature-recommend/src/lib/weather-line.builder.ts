import { Injectable } from '@nestjs/common';
import type {
  WeatherCondition,
  WeatherSnapshot,
} from '@rsn/api/data-access-weather';
import { greetingFor } from '@rsn/shared/util-domain';

/**
 * UI-47: the phrase the weather line uses for each WX-10 weather word ("21 °C
 * and stormy this afternoon in Mexico City"). The model still gets the word.
 */
const CONDITION_PHRASES: Record<WeatherCondition, string> = {
  clear: 'clear',
  cloudy: 'cloudy',
  fog: 'foggy',
  drizzle: 'drizzly',
  rain: 'rainy',
  snow: 'snowy',
  thunderstorm: 'stormy',
};

/**
 * WX-2/WX-10: the one-line weather sentence shown next to the greeting, for
 * example "9 °C and clear tonight in Tel Aviv". Pure: no I/O, no state.
 */
@Injectable()
export class WeatherLineBuilder {
  /** WX-10: the greeting line returned with every recommendation response; UI-37: with its unit; UI-47: phrases. */
  line(snapshot: WeatherSnapshot): string {
    const degrees = Math.round(snapshot.temperatureC);
    const phrase = CONDITION_PHRASES[snapshot.condition];
    return `${degrees} °C and ${phrase} ${timePhrase(snapshot)} in ${snapshot.city}`;
  }
}

/**
 * WX-10: time of day from `is_day` and the local hour. Night is always
 * "tonight"; daytime reuses the hour bands of `greetingFor` (UI-10) so the
 * greeting and the weather line never disagree.
 */
function timePhrase(snapshot: WeatherSnapshot): string {
  if (!snapshot.isDay) return 'tonight';
  switch (greetingFor(snapshot.localHour)) {
    case 'Good morning':
      return 'this morning';
    case 'Good afternoon':
      return 'this afternoon';
    default:
      return 'tonight';
  }
}

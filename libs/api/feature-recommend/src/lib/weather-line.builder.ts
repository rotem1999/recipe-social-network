import { Injectable } from '@nestjs/common';
import type { WeatherSnapshot } from '@rsn/api/data-access-weather';
import { greetingFor } from '@rsn/shared/util-domain';

/**
 * WX-2/WX-10: the one-line weather sentence shown next to the greeting, for
 * example "9 °C and clear tonight in Tel Aviv". Pure: no I/O, no state.
 */
@Injectable()
export class WeatherLineBuilder {
  /** WX-10: the greeting line returned with every recommendation response; UI-37: with its unit. */
  line(snapshot: WeatherSnapshot): string {
    const degrees = Math.round(snapshot.temperatureC);
    return `${degrees} °C and ${snapshot.condition} ${timePhrase(snapshot)} in ${snapshot.city}`;
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

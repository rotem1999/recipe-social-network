// SPEC §8 WX-2, WX-10: the one-line weather sentence of the greeting. Pure, no I/O.
import type { WeatherSnapshot } from '@rsn/api/data-access-weather';

import { WeatherLineBuilder } from './weather-line.builder';

function snapshot(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    city: 'Tel Aviv',
    temperatureC: 8.6,
    isDay: false,
    condition: 'clear',
    weatherCode: 0,
    localHour: 21,
    ...overrides,
  };
}

describe('WeatherLineBuilder.line (WX-2, WX-10)', () => {
  const builder = new WeatherLineBuilder();

  it('WX-2 words a cold night as "9° and clear tonight in Tel Aviv"', () => {
    expect(builder.line(snapshot())).toBe('9° and clear tonight in Tel Aviv');
  });

  it('WX-10 says "tonight" whenever Open-Meteo reports night, whatever the hour', () => {
    expect(builder.line(snapshot({ isDay: false, localHour: 6 }))).toBe(
      '9° and clear tonight in Tel Aviv',
    );
  });

  it('WX-2 says "this morning" during the day in the morning band', () => {
    expect(
      builder.line(
        snapshot({ isDay: true, localHour: 8, temperatureC: 17, condition: 'rain' }),
      ),
    ).toBe('17° and rain this morning in Tel Aviv');
  });

  it('WX-2 says "this afternoon" during the day in the afternoon band', () => {
    expect(
      builder.line(
        snapshot({
          isDay: true,
          localHour: 14,
          temperatureC: 31.4,
          condition: 'cloudy',
        }),
      ),
    ).toBe('31° and cloudy this afternoon in Tel Aviv');
  });

  it('WX-2 says "tonight" for a daylight hour in the evening band', () => {
    expect(
      builder.line(snapshot({ isDay: true, localHour: 19, temperatureC: 22 })),
    ).toBe('22° and clear tonight in Tel Aviv');
  });

  it('WX-10 rounds the temperature to whole degrees, including negatives', () => {
    expect(builder.line(snapshot({ temperatureC: -3.4 }))).toBe(
      '-3° and clear tonight in Tel Aviv',
    );
    expect(builder.line(snapshot({ temperatureC: 2.5 }))).toBe(
      '3° and clear tonight in Tel Aviv',
    );
  });

  it('WX-10 names the geocoded city Open-Meteo returned', () => {
    expect(builder.line(snapshot({ city: 'Jerusalem' }))).toBe(
      '9° and clear tonight in Jerusalem',
    );
  });
});

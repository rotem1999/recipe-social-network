// SPEC §8 WX-10: the WMO weather code becomes one of the seven words the
// recommendation prompt uses (clear, cloudy, fog, drizzle, rain, snow,
// thunderstorm). Ranges are Open-Meteo's documented table (§16 W3).

import { conditionFromWmoCode } from './wmo-codes';

describe('conditionFromWmoCode', () => {
  it('WX-10 maps 0 to clear', () => {
    expect(conditionFromWmoCode(0)).toBe('clear');
  });

  it('WX-10 maps 1..3 to cloudy', () => {
    expect([1, 2, 3].map(conditionFromWmoCode)).toEqual([
      'cloudy',
      'cloudy',
      'cloudy',
    ]);
  });

  it('WX-10 maps 45 and 48 to fog', () => {
    expect([45, 48].map(conditionFromWmoCode)).toEqual(['fog', 'fog']);
  });

  it('WX-10 maps 51..57 to drizzle', () => {
    expect([51, 53, 55, 56, 57].map(conditionFromWmoCode)).toEqual([
      'drizzle',
      'drizzle',
      'drizzle',
      'drizzle',
      'drizzle',
    ]);
  });

  it('WX-10 maps 61..67 and the 80..82 showers to rain', () => {
    expect([61, 63, 65, 66, 67, 80, 81, 82].map(conditionFromWmoCode)).toEqual(
      Array(8).fill('rain'),
    );
  });

  it('WX-10 maps 71..77 and the 85..86 snow showers to snow', () => {
    expect([71, 73, 75, 77, 85, 86].map(conditionFromWmoCode)).toEqual(
      Array(6).fill('snow'),
    );
  });

  it('WX-10 maps 95..99 to thunderstorm', () => {
    expect([95, 96, 99].map(conditionFromWmoCode)).toEqual(
      Array(3).fill('thunderstorm'),
    );
  });

  it('WX-10 falls back to cloudy for a code outside the table', () => {
    expect(conditionFromWmoCode(4)).toBe('cloudy');
    expect(conditionFromWmoCode(-1)).toBe('cloudy');
    expect(conditionFromWmoCode(200)).toBe('cloudy');
  });
});

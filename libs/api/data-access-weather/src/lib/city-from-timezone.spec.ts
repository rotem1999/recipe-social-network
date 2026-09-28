// SPEC §8 WX-9: location comes from the OS timezone only; the city is the
// segment after the last `/`, underscores become spaces (WX-10).

import { cityFromTimezone } from './city-from-timezone';

describe('cityFromTimezone', () => {
  it('WX-9 reads Jerusalem out of Asia/Jerusalem', () => {
    expect(cityFromTimezone('Asia/Jerusalem')).toBe('Jerusalem');
  });

  it('WX-10 turns the underscores of America/New_York into spaces', () => {
    expect(cityFromTimezone('America/New_York')).toBe('New York');
  });

  it('WX-9 takes the last segment of a three-part zone', () => {
    expect(cityFromTimezone('America/Argentina/Buenos_Aires')).toBe(
      'Buenos Aires',
    );
  });

  it('WX-9 returns null for UTC, which carries no city', () => {
    expect(cityFromTimezone('UTC')).toBe(null);
  });

  it('WX-9 returns null for an empty timezone', () => {
    expect(cityFromTimezone('')).toBe(null);
  });

  it('WX-9 returns null when the segment after the slash is empty', () => {
    expect(cityFromTimezone('Asia/')).toBe(null);
    expect(cityFromTimezone('Asia/   ')).toBe(null);
  });
});

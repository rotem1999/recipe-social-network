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

  it('WX-9 returns null for GMT, which carries no city', () => {
    expect(cityFromTimezone('GMT')).toBe(null);
  });

  it('WX-9 returns null for any zone without a "/"', () => {
    expect(cityFromTimezone('EST5EDT')).toBe(null);
    expect(cityFromTimezone('Jerusalem')).toBe(null);
  });

  it('WX-9 returns null for every zone under Etc/', () => {
    expect(cityFromTimezone('Etc/UTC')).toBe(null);
    expect(cityFromTimezone('Etc/GMT')).toBe(null);
    expect(cityFromTimezone('Etc/GMT+2')).toBe(null);
    expect(cityFromTimezone('Etc/GMT-14')).toBe(null);
    expect(cityFromTimezone('Etc/Universal')).toBe(null);
  });

  it('WX-9 keeps a city whose region merely contains "Etc"', () => {
    expect(cityFromTimezone('Europe/Etc_Town')).toBe('Etc Town');
  });

  it.each([
    ['Asia/Calcutta', 'Kolkata'],
    ['Europe/Kiev', 'Kyiv'],
    ['Asia/Saigon', 'Ho Chi Minh'],
    ['America/Godthab', 'Nuuk'],
    ['Asia/Katmandu', 'Kathmandu'],
    ['Asia/Rangoon', 'Yangon'],
    ['Atlantic/Faeroe', 'Tórshavn'],
    ['Atlantic/Faroe', 'Tórshavn'],
  ])('WX-9 reads the legacy zone %s by its current city name %s', (zone, city) => {
    expect(cityFromTimezone(zone)).toBe(city);
  });

  it('WX-9 reads a legacy zone name in any letter case', () => {
    expect(cityFromTimezone('ASIA/CALCUTTA')).toBe('Kolkata');
    expect(cityFromTimezone('atlantic/faeroe')).toBe('Tórshavn');
  });

  it.each([
    ['Asia/Kolkata', 'Kolkata'],
    ['Europe/Kyiv', 'Kyiv'],
    ['Asia/Ho_Chi_Minh', 'Ho Chi Minh'],
    ['America/Nuuk', 'Nuuk'],
    ['Asia/Kathmandu', 'Kathmandu'],
    ['Asia/Yangon', 'Yangon'],
  ])('WX-9 keeps reading the current zone %s as %s', (zone, city) => {
    expect(cityFromTimezone(zone)).toBe(city);
  });

  it('WX-9 returns null when the segment after the slash is empty', () => {
    expect(cityFromTimezone('Asia/')).toBe(null);
    expect(cityFromTimezone('Asia/   ')).toBe(null);
  });
});

/**
 * WX-9 (BUG-029): legacy zone names, keyed in lower case, read by the current city name
 * from the IANA tzdata `backward` links (SPEC §16 W13).
 */
const LEGACY_ZONE_CITIES: ReadonlyMap<string, string> = new Map([
  ['asia/calcutta', 'Kolkata'],
  ['europe/kiev', 'Kyiv'],
  ['asia/saigon', 'Ho Chi Minh'],
  ['america/godthab', 'Nuuk'],
  ['asia/katmandu', 'Kathmandu'],
  ['asia/rangoon', 'Yangon'],
  // The Faroe zone names a region, and Open-Meteo has no city "Faroe": its capital
  // Tórshavn carries the Atlantic/Faroe zone (checked 2026-09-30).
  ['atlantic/faeroe', 'Tórshavn'],
  ['atlantic/faroe', 'Tórshavn'],
]);

/**
 * WX-9/WX-10: the city segment of an IANA timezone, e.g. `Asia/Jerusalem` →
 * `Jerusalem`, `America/New_York` → `New York`. Null when the zone has no city:
 * no `/` at all (`UTC`, `GMT`, an empty string) or a zone under `Etc/`
 * (`Etc/UTC`, `Etc/GMT+2`), so no weather context is looked up (BUG-017). A legacy zone
 * name that browsers and Node still report is read by its current city name (BUG-029).
 */
export function cityFromTimezone(timezone: string): string | null {
  const separator = timezone.lastIndexOf('/');
  if (separator === -1) return null;
  const zone = timezone.trim().toLowerCase();
  if (zone.startsWith('etc/')) return null;
  const current = LEGACY_ZONE_CITIES.get(zone);
  if (current !== undefined) return current;
  const city = timezone
    .slice(separator + 1)
    .replace(/_/g, ' ')
    .trim();
  return city.length > 0 ? city : null;
}

/**
 * WX-9/WX-10: the city segment of an IANA timezone, e.g. `Asia/Jerusalem` →
 * `Jerusalem`, `America/New_York` → `New York`. Null when the value carries no
 * `/` and therefore no city (`UTC`, an empty string).
 */
export function cityFromTimezone(timezone: string): string | null {
  const separator = timezone.lastIndexOf('/');
  if (separator === -1) return null;
  const city = timezone
    .slice(separator + 1)
    .replace(/_/g, ' ')
    .trim();
  return city.length > 0 ? city : null;
}

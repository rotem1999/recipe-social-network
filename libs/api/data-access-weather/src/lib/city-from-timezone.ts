/**
 * WX-9/WX-10: the city segment of an IANA timezone, e.g. `Asia/Jerusalem` →
 * `Jerusalem`, `America/New_York` → `New York`. Null when the zone has no city:
 * no `/` at all (`UTC`, `GMT`, an empty string) or a zone under `Etc/`
 * (`Etc/UTC`, `Etc/GMT+2`), so no weather context is looked up (BUG-017).
 */
export function cityFromTimezone(timezone: string): string | null {
  const separator = timezone.lastIndexOf('/');
  if (separator === -1) return null;
  if (timezone.trim().toLowerCase().startsWith('etc/')) return null;
  const city = timezone
    .slice(separator + 1)
    .replace(/_/g, ' ')
    .trim();
  return city.length > 0 ? city : null;
}

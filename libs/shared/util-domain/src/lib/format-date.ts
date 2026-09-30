// SPEC.md §11.5 UI-32, UI-46: one date format everywhere in the app, independent
// of the system locale: "29 Sep 2026", and with a time "29 Sep 2026, 01:07".

/** The three-letter English months of "3 Sep 2026". */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** UI-46: "29 Sep 2026" in local time, or '' for an unreadable date. */
export function formatDate(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** UI-46: "29 Sep 2026, 01:07" (24-hour local time), or '' for an unreadable date. */
export function formatDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)}, ${hours}:${minutes}`;
}

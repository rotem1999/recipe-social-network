// SPEC.md §11.5 UI-46: one date format everywhere in the app, independent of
// the system locale. Dates are built in local time so the tests hold in any
// time zone the runner uses.
import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from './format-date';

/** 29 Sep 2026, 01:07 local time. */
const LOCAL = new Date(2026, 8, 29, 1, 7, 42);

describe('formatDate', () => {
  it('UI-46 writes "29 Sep 2026"', () => {
    expect(formatDate(LOCAL)).toBe('29 Sep 2026');
  });

  it('UI-46 writes a single-digit day without a leading zero: "3 Sep 2026"', () => {
    expect(formatDate(new Date(2026, 8, 3))).toBe('3 Sep 2026');
  });

  it('UI-46 uses the three-letter English month for every month', () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      formatDate(new Date(2026, month, 15)),
    );

    expect(months).toEqual([
      '15 Jan 2026',
      '15 Feb 2026',
      '15 Mar 2026',
      '15 Apr 2026',
      '15 May 2026',
      '15 Jun 2026',
      '15 Jul 2026',
      '15 Aug 2026',
      '15 Sep 2026',
      '15 Oct 2026',
      '15 Nov 2026',
      '15 Dec 2026',
    ]);
  });

  it('UI-46 accepts an ISO string, a timestamp and a Date alike', () => {
    expect(formatDate('2026-09-29T01:07:42')).toBe('29 Sep 2026');
    expect(formatDate(LOCAL.getTime())).toBe('29 Sep 2026');
    expect(formatDate(LOCAL)).toBe('29 Sep 2026');
  });

  it("UI-46 reads an ISO instant in local time, as the API's timestamps are", () => {
    const instant = '2026-09-29T12:00:00.000Z';
    const local = new Date(instant);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    expect(formatDate(instant)).toBe(
      `${local.getDate()} ${months[local.getMonth()]} ${local.getFullYear()}`,
    );
  });

  it.each([
    ['text that is not a date', 'not a date'],
    ['an empty string', ''],
    ['NaN', Number.NaN],
    ['an invalid Date', new Date('nope')],
  ])('UI-46 returns an empty string for %s', (_name, value) => {
    expect(formatDate(value)).toBe('');
  });
});

describe('formatDateTime', () => {
  it('UI-46 writes "29 Sep 2026, 01:07" with a zero-padded 24-hour time', () => {
    expect(formatDateTime(LOCAL)).toBe('29 Sep 2026, 01:07');
  });

  it('UI-46 uses the 24-hour clock for afternoon times', () => {
    expect(formatDateTime(new Date(2026, 8, 29, 23, 59))).toBe(
      '29 Sep 2026, 23:59',
    );
  });

  it('UI-46 writes midnight as 00:00', () => {
    expect(formatDateTime(new Date(2026, 0, 1, 0, 0))).toBe('1 Jan 2026, 00:00');
  });

  it('UI-46 drops the seconds', () => {
    expect(formatDateTime(new Date(2026, 8, 29, 1, 7, 59))).toBe(
      '29 Sep 2026, 01:07',
    );
  });

  it('UI-46 accepts an ISO string and a timestamp', () => {
    expect(formatDateTime('2026-09-29T01:07:42')).toBe('29 Sep 2026, 01:07');
    expect(formatDateTime(LOCAL.getTime())).toBe('29 Sep 2026, 01:07');
  });

  it.each([
    ['text that is not a date', 'not a date'],
    ['an empty string', ''],
    ['NaN', Number.NaN],
    ['an invalid Date', new Date('nope')],
  ])('UI-46 returns an empty string for %s', (_name, value) => {
    expect(formatDateTime(value)).toBe('');
  });
});

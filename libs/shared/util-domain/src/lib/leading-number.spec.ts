// SPEC §6 CAT-6 and §9 NUT-10: the one reader of the number a measure or a
// weight note starts with. Pure function, no I/O.
import { describe, expect, it } from 'vitest';

import { readLeadingNumber } from './leading-number';

describe('readLeadingNumber', () => {
  it('CAT-6 reads a mixed ascii number ("1 1/2 lb") and returns the text after it', () => {
    expect(readLeadingNumber('1 1/2 lb')).toEqual({ value: 1.5, rest: ' lb' });
  });

  it('CAT-6 reads a mixed unicode number ("1½")', () => {
    expect(readLeadingNumber('1½')).toEqual({ value: 1.5, rest: '' });
    expect(readLeadingNumber('2¼ cups')).toEqual({ value: 2.25, rest: ' cups' });
    expect(readLeadingNumber('1 ¾ tsp')).toEqual({ value: 1.75, rest: ' tsp' });
  });

  it('CAT-6 reads a plain ascii fraction ("1/2")', () => {
    expect(readLeadingNumber('1/2')).toEqual({ value: 0.5, rest: '' });
    expect(readLeadingNumber('3/4 cup')).toEqual({ value: 0.75, rest: ' cup' });
  });

  it('CAT-6 reads a bare unicode fraction ("½", "¼", "¾")', () => {
    expect(readLeadingNumber('½')).toEqual({ value: 0.5, rest: '' });
    expect(readLeadingNumber('¼ tsp')).toEqual({ value: 0.25, rest: ' tsp' });
    expect(readLeadingNumber('¾')).toEqual({ value: 0.75, rest: '' });
  });

  it('CAT-6 reads a decimal ("1.5")', () => {
    expect(readLeadingNumber('1.5')).toEqual({ value: 1.5, rest: '' });
    expect(readLeadingNumber('0.25 kg')).toEqual({ value: 0.25, rest: ' kg' });
  });

  it('CAT-6 reads an integer ("1") and keeps the rest text as it is', () => {
    expect(readLeadingNumber('1')).toEqual({ value: 1, rest: '' });
    expect(readLeadingNumber('2 large')).toEqual({ value: 2, rest: ' large' });
    expect(readLeadingNumber('4oz')).toEqual({ value: 4, rest: 'oz' });
  });

  it('NUT-10 leaves the text after a weight word in the rest ("1 lb minced")', () => {
    expect(readLeadingNumber('1 lb minced')).toEqual({
      value: 1,
      rest: ' lb minced',
    });
  });

  it('UNSPECIFIED reads "1/0" as the integer 1 with the rest "/0" (no division by zero)', () => {
    // SPEC CAT-6 does not cover a zero denominator; the code falls back to
    // the leading integer.
    expect(readLeadingNumber('1/0')).toEqual({ value: 1, rest: '/0' });
    expect(readLeadingNumber('1 1/0')).toEqual({ value: 1, rest: ' 1/0' });
  });

  it('CAT-6 returns null when the text does not start with a number', () => {
    expect(readLeadingNumber('abc')).toBe(null);
    expect(readLeadingNumber('to taste')).toBe(null);
    expect(readLeadingNumber('')).toBe(null);
  });

  it('UNSPECIFIED does not skip leading spaces (callers trim first)', () => {
    // SPEC CAT-6 and NUT-10 do not say; the mapper and the weight-note reader
    // both trim before calling.
    expect(readLeadingNumber(' 1 lb')).toBe(null);
  });
});

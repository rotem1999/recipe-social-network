// SPEC.md CAT-6 and NUT-10: the one reader of the number a measure starts with.
// TheMealDB measures (CAT-6) and weight notes (NUT-10) share it.

/** CAT-6: the unicode fractions TheMealDB measures use. */
const UNICODE_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
};

/** A number read from the start of a text, and the text after it. */
export interface LeadingNumber {
  value: number;
  rest: string;
}

/**
 * CAT-6: reads a leading integer, decimal, fraction, mixed number or unicode
 * fraction ("1 1/2", "1½", "1/2", "½", "1.5", "1"); null when the text does
 * not start with one.
 */
export function readLeadingNumber(text: string): LeadingNumber | null {
  const mixedAscii = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/.exec(text);
  if (mixedAscii && Number(mixedAscii[3]) !== 0) {
    return {
      value:
        Number(mixedAscii[1]) + Number(mixedAscii[2]) / Number(mixedAscii[3]),
      rest: text.slice(mixedAscii[0].length),
    };
  }

  const mixedUnicode = /^(\d+)\s*([½¼¾])/.exec(text);
  if (mixedUnicode) {
    return {
      value: Number(mixedUnicode[1]) + UNICODE_FRACTIONS[mixedUnicode[2]],
      rest: text.slice(mixedUnicode[0].length),
    };
  }

  const fraction = /^(\d+)\s*\/\s*(\d+)/.exec(text);
  if (fraction && Number(fraction[2]) !== 0) {
    return {
      value: Number(fraction[1]) / Number(fraction[2]),
      rest: text.slice(fraction[0].length),
    };
  }

  const unicode = /^([½¼¾])/.exec(text);
  if (unicode) {
    return {
      value: UNICODE_FRACTIONS[unicode[1]],
      rest: text.slice(unicode[0].length),
    };
  }

  const decimal = /^(\d+(?:\.\d+)?)/.exec(text);
  if (decimal) {
    return { value: Number(decimal[1]), rest: text.slice(decimal[0].length) };
  }

  return null;
}

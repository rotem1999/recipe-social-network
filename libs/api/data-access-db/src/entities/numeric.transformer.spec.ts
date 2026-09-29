// SPEC §6 RATE-2, §12.1 `recipes.rating_average numeric(3,2)`: the pg driver
// hands `numeric` back as a string; the property stays `number | null`.

import { numericTransformer } from './numeric.transformer';

describe('numericTransformer', () => {
  it("RATE-2 reads the driver's '4.75' as the number 4.75", () => {
    expect(numericTransformer.from('4.75')).toBe(4.75);
  });

  it('RATE-2 keeps the two decimals of the stored average', () => {
    expect(numericTransformer.from('1.00')).toBe(1);
    expect(numericTransformer.from('3.25')).toBe(3.25);
    expect(numericTransformer.from('5.00')).toBe(5);
  });

  it('RATE-2 reads null as null, never as zero', () => {
    expect(numericTransformer.from(null)).toBe(null);
    expect(numericTransformer.from(null)).not.toBe(0);
  });

  it('RATE-2 passes a number through unchanged', () => {
    expect(numericTransformer.from(4.75)).toBe(4.75);
  });

  it('RATE-2 writes a number as it is', () => {
    expect(numericTransformer.to(4.75)).toBe(4.75);
  });

  it('RATE-2 writes null for a missing average', () => {
    expect(numericTransformer.to(null)).toBe(null);
    expect(numericTransformer.to(undefined)).toBe(null);
  });
});

import type { ValueTransformer } from 'typeorm';

/**
 * RATE-2, §12.1 `recipes.rating_average numeric(3,2)`: the `pg` driver returns
 * `numeric` as a string to keep full precision, so TypeScript would see `string`.
 * This transformer keeps the property `number | null` on both sides.
 */
export const numericTransformer: ValueTransformer = {
  to(value: number | null | undefined): number | null {
    return value === undefined || value === null ? null : value;
  },
  from(value: string | number | null): number | null {
    if (value === null) return null;
    return typeof value === 'number' ? value : Number(value);
  },
};

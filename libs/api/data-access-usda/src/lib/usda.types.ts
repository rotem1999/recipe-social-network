/**
 * Public types of the FoodData Central client (SPEC §9 NUT-2, NUT-6).
 * Nutrient values are per 100 g, as USDA publishes them.
 */

/** The four searchable FDC data types (SPEC §9, verified fact U2). */
export const USDA_DATA_TYPES = [
  'Foundation',
  'SR Legacy',
  'Survey (FNDDS)',
  'Branded',
] as const;

export type UsdaDataType = (typeof USDA_DATA_TYPES)[number];

/** One `POST /foods/search` result (NUT-6). */
export interface UsdaFoodHit {
  fdcId: number;
  description: string;
  dataType: string;
  /** Energy per 100 g, from nutrient 1008, then 2047, then 2048; null when absent (NUT-5). */
  kcalPer100g: number | null;
  /** `foodMeasures[0].gramWeight` when the search result carries it (NUT-6). */
  gramWeightPerMeasure: number | null;
}

/** One household portion of a food detail (NUT-6). */
export interface UsdaFoodPortion {
  gramWeight: number;
  description: string;
}

/** One `GET /food/{fdcId}` result (NUT-6). */
export interface UsdaFoodDetail {
  fdcId: number;
  description: string;
  /** Energy per 100 g, from nutrient 1008, then 2047, then 2048; null when absent (NUT-5). */
  kcalPer100g: number | null;
  portions: UsdaFoodPortion[];
}

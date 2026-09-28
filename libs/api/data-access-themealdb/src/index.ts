// Public surface of @rsn/api/data-access-themealdb (§3.3, §11.3).

export { TheMealDbModule } from './lib/themealdb.module';
export { TheMealDbService } from './lib/themealdb.service';
export { TheMealDbMapper } from './lib/themealdb.mapper';
export {
  THEMEALDB_ATTRIBUTION,
  parseMeasure,
  toCatalogueItem,
  toCataloguePreview,
  toIngredients,
  toRecipeContent,
  toSteps,
} from './lib/mapper';
export { MEAL_SLOT_COUNT } from './lib/meal-record';
export type {
  MealCategoryRow,
  MealFilterRow,
  MealIngredientSlots,
  MealMeasureSlots,
  MealRecord,
  MealRecordFields,
  MealSlot,
} from './lib/meal-record';

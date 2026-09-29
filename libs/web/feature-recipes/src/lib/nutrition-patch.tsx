// SPEC.md NUT-1..6, NUT-11, UI-15 and UI-48, design guide §5: the nutrition patch
// under the ingredients. The headline is the NUT-11 range between both estimates;
// the mode switch (ingredient mode by default, NUT-4) picks the breakdown below it.
// A miss reads "nutrition data unavailable" (NUT-5).
import { useState } from 'react';
import type { ReactElement } from 'react';
import type {
  NutritionEstimateDto,
  NutritionMode,
} from '@rsn/shared/util-contracts';
import { useApi, useRequest } from '@rsn/web/data-access-api';
import { InlineError, Segmented } from '@rsn/web/ui';

export interface NutritionPatchProps {
  recipeId: string;
}

/** NUT-5: the one string an unmatched food shows. */
const UNAVAILABLE = 'nutrition data unavailable';

const MODES: readonly { value: NutritionMode; label: string }[] = [
  { value: 'ingredients', label: 'Ingredients' },
  { value: 'meal', label: 'Meal name' },
];

/** Whole kcal; the API's numbers are already per portion or per ingredient. */
function formatKcal(kcal: number | null): string {
  return kcal === null ? UNAVAILABLE : String(Math.round(kcal));
}

/**
 * NUT-11: "about N–M kcal per portion", "about N kcal per portion" when both ends
 * are equal (the API rounds them to 10 kcal), "at least N kcal per portion" when
 * only a partial ingredients value exists, and NUT-5's phrase when there is none.
 */
function headline(estimate: NutritionEstimateDto | null): string {
  if (estimate === null) {
    return UNAVAILABLE;
  }
  const low = Math.round(estimate.lowKcalPerPortion);
  const high = Math.round(estimate.highKcalPerPortion);
  if (estimate.atLeast) {
    return `at least ${low} kcal per portion`;
  }
  return low === high
    ? `about ${low} kcal per portion`
    : `about ${low}–${high} kcal per portion`;
}

/** NUT-3/NUT-4: the switchable calorie box the guide draws in neutral-100. */
export function NutritionPatch({
  recipeId,
}: NutritionPatchProps): ReactElement {
  const api = useApi();
  const [mode, setMode] = useState<NutritionMode>('ingredients');
  const { data, error, loading } = useRequest(
    () => api.getNutrition(recipeId, mode),
    [recipeId, mode],
  );
  // NUT-11: the estimate; an API from before NUT-11 sends none, read as null.
  const estimate: NutritionEstimateDto | null = data?.estimate ?? null;
  // NUT-11: the ingredients the ingredients-mode pass left out, in either mode.
  const notCounted =
    loading || estimate === null
      ? []
      : (estimate.notCounted ?? []).filter((name) => name.trim() !== '');

  return (
    <div className="nutrition-patch">
      <div className="row between wrap">
        <div>
          {/* NUT-11: the headline range, whichever mode is shown below. */}
          <div className="nutrition-headline">
            {loading
              ? '…'
              : data === null
                ? UNAVAILABLE
                : headline(estimate)}
          </div>
          <div className="text-muted text-caption">
            Estimate from USDA FoodData Central
          </div>
          {notCounted.length === 0 ? null : (
            <div className="text-muted text-caption">
              Not counted: {notCounted.join(', ')}
            </div>
          )}
        </div>
        <Segmented
          options={MODES}
          value={mode}
          onChange={setMode}
          label="Nutrition source"
          compact
        />
      </div>

      {error === null ? null : <InlineError>{error.message}</InlineError>}

      {/* NUT-6 ingredients mode: one row per ingredient, unmatched ones named. */}
      {data !== null && data.mode === 'ingredients' ? (
        <>
          {/* UI-48: the rows do not follow the servings stepper (UI-14), so they say so. */}
          <p className="text-muted text-caption m-0 mt-3 mb-1">
            For the recipe as written ({data.servings}{' '}
            {data.servings === 1 ? 'serving' : 'servings'})
          </p>
          <ul className="list-reset stack gap-1">
            {data.ingredients.map((ingredient, index) => (
              <li key={`${index}-${ingredient.name}`} className="nutrition-row">
                {/* UI-41: ingredient names are user text. */}
                <span dir="auto">{ingredient.name}</span>
                <span
                  className={
                    ingredient.kcal === null ? 'text-muted' : undefined
                  }
                >
                  {ingredient.kcal === null
                    ? UNAVAILABLE
                    : `${formatKcal(ingredient.kcal)} kcal`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* NUT-6 meal mode: the FNDDS description the total was taken from. */}
      {data !== null && data.mode === 'meal' ? (
        <p className="text-muted text-caption m-0 mt-2">
          {data.matchedDescription === null
            ? `No FoodData Central match for this meal name — ${UNAVAILABLE}.`
            : `Matched "${data.matchedDescription}" in FoodData Central.`}
        </p>
      ) : null}
    </div>
  );
}

// SPEC.md NUT-1..6 and UI-15, design guide §5: the nutrition patch under the
// ingredients. Ingredient mode is the default (NUT-4); a miss reads
// "nutrition data unavailable" (NUT-5), per ingredient and for the total.
import { useState } from 'react';
import type { ReactElement } from 'react';
import type { NutritionMode } from '@rsn/shared/util-contracts';
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

  return (
    <div
      style={{
        marginTop: 'var(--space-6)',
        padding: 'var(--space-4) var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--color-neutral-100)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: '20px', fontFamily: 'var(--font-heading)' }}>
            {loading
              ? '…'
              : data === null
                ? UNAVAILABLE
                : formatKcal(data.kcalPerPortion)}
          </div>
          <div className="text-muted" style={{ fontSize: '11px' }}>
            kcal per portion · USDA FoodData Central
          </div>
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
        <ul
          style={{
            listStyle: 'none',
            margin: 'var(--space-3) 0 0',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {data.ingredients.map((ingredient, index) => (
            <li
              key={`${index}-${ingredient.name}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                fontSize: '12px',
              }}
            >
              <span>{ingredient.name}</span>
              <span
                className={ingredient.kcal === null ? 'text-muted' : undefined}
              >
                {ingredient.kcal === null
                  ? UNAVAILABLE
                  : `${formatKcal(ingredient.kcal)} kcal`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* NUT-6 meal mode: the FNDDS description the total was taken from. */}
      {data !== null && data.mode === 'meal' ? (
        <p
          className="text-muted"
          style={{ fontSize: '11px', margin: 'var(--space-2) 0 0' }}
        >
          {data.matchedDescription === null
            ? `No FoodData Central match for this meal name — ${UNAVAILABLE}.`
            : `Matched "${data.matchedDescription}" in FoodData Central.`}
        </p>
      ) : null}

      {data !== null && data.mode === 'ingredients' && data.partial ? (
        <p
          className="text-muted"
          style={{ fontSize: '11px', margin: 'var(--space-2) 0 0' }}
        >
          Some ingredients could not be matched, so the total is partial.
        </p>
      ) : null}
    </div>
  );
}

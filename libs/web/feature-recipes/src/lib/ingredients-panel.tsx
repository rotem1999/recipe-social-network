// SPEC.md §3.1.1 and UI-14: the ingredient list with the servings stepper. The
// stepper rescales the quantities on screen only — nothing is saved.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ingredient, Unit } from '@rsn/shared/util-domain';
import { scaleQuantity } from '@rsn/shared/util-domain';
import { Button } from '@rsn/web/ui';

export interface IngredientsPanelProps {
  ingredients: readonly Ingredient[];
  /** The servings the recipe is written for (§3.1.1). */
  servings: number;
}

/** Two decimals at most, with the trailing zeros dropped ("1.5", not "1.50"). */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** §3.1.1: an empty quantity means "to taste"; `none` is a unit-less count. */
function formatQuantity(quantity: number | null, unit: Unit): string {
  const parts: string[] = [];
  if (quantity !== null) {
    parts.push(formatNumber(quantity));
  }
  if (unit !== 'none') {
    parts.push(unit);
  }
  return parts.length === 0 ? 'to taste' : parts.join(' ');
}

/** The guide's §5 ingredients column: header stepper, then one row per ingredient. */
export function IngredientsPanel({
  ingredients,
  servings,
}: IngredientsPanelProps): ReactElement {
  const [shownServings, setShownServings] = useState(servings);

  // A different recipe (or a different version) resets the display override.
  useEffect(() => {
    setShownServings(servings);
  }, [servings]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
        }}
      >
        <h4 style={{ margin: 0 }}>Ingredients</h4>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <Button
            variant="icon"
            aria-label="Fewer servings"
            disabled={shownServings <= 1}
            style={{ width: '28px', height: '28px' }}
            onClick={() => setShownServings((value) => Math.max(1, value - 1))}
          >
            −
          </Button>
          <span
            style={{ fontSize: '13px', minWidth: '76px', textAlign: 'center' }}
            aria-live="polite"
          >
            {shownServings} servings
          </span>
          <Button
            variant="icon"
            aria-label="More servings"
            style={{ width: '28px', height: '28px' }}
            onClick={() => setShownServings((value) => value + 1)}
          >
            +
          </Button>
        </span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {ingredients.map((ingredient, index) => (
          <li
            // §3.1.1 ingredients are an ordered list and may repeat a name.
            key={`${index}-${ingredient.name}`}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) 2px',
              fontSize: '14px',
              borderBottom:
                '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)',
            }}
          >
            <span
              style={{
                minWidth: '64px',
                color: 'var(--color-accent-700)',
                fontWeight: 600,
              }}
            >
              {formatQuantity(
                scaleQuantity(ingredient.quantity, servings, shownServings),
                ingredient.unit,
              )}
            </span>
            <span>
              {ingredient.name}{' '}
              {ingredient.note === undefined ||
              ingredient.note === '' ? null : (
                <span className="text-muted" style={{ fontSize: '12px' }}>
                  {ingredient.note}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

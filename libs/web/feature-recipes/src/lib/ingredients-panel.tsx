// SPEC.md §3.1.1, UI-14 and UI-37: the ingredient list with the servings stepper.
// The stepper rescales the quantities on screen only — nothing is saved.
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ingredient } from '@rsn/shared/util-domain';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  ingredientAmount,
  scaleQuantity,
} from '@rsn/shared/util-domain';
import { Button } from '@rsn/web/ui';

export interface IngredientsPanelProps {
  ingredients: readonly Ingredient[];
  /** The servings the recipe is written for (§3.1.1). */
  servings: number;
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
      <div className="panel-header">
        <h4 className="m-0">Ingredients</h4>
        <span className="row-inline">
          <Button
            variant="icon"
            aria-label="Fewer servings"
            disabled={shownServings <= MIN_SERVINGS}
            className="stepper-button"
            onClick={() =>
              setShownServings((value) => Math.max(MIN_SERVINGS, value - 1))
            }
          >
            −
          </Button>
          <span className="servings-label" aria-live="polite">
            {/* UI-37: "1 serving", "N servings". */}
            {shownServings === 1 ? '1 serving' : `${shownServings} servings`}
          </span>
          {/* UI-14 / §3.1.1: the stepper stops at 6 servings. */}
          <Button
            variant="icon"
            aria-label="More servings"
            disabled={shownServings >= MAX_SERVINGS}
            className="stepper-button"
            onClick={() =>
              setShownServings((value) => Math.min(MAX_SERVINGS, value + 1))
            }
          >
            +
          </Button>
        </span>
      </div>
      <ul className="list-reset stack">
        {ingredients.map((ingredient, index) => {
          // UI-37, BUG-030: a note that is itself an amount ("1 Can") fills the
          // amount column instead of "to taste" and is not repeated as the note.
          const { amount, note } = ingredientAmount({
            quantity: scaleQuantity(ingredient.quantity, servings, shownServings),
            unit: ingredient.unit,
            note: ingredient.note,
          });
          return (
            <li
              // §3.1.1 ingredients are an ordered list and may repeat a name.
              key={`${index}-${ingredient.name}`}
              className="ingredient-row"
            >
              {/* UI-41: the amount can be a moved note (UI-37), so it is directional too. */}
              <span className="ingredient-qty" dir="auto">
                {amount}
              </span>
              {/* UI-41: names and notes are user text, so they carry dir="auto". */}
              <span>
                <span dir="auto">{ingredient.name}</span>{' '}
                {note === null ? null : (
                  <span dir="auto" className="text-muted text-small">
                    {note}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

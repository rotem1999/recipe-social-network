// SPEC.md §11.5 UI-15: cook mode's collapsible "Ingredients" panel lists the
// recipe's ingredients at its own servings (no stepper here; the detail screen
// has one). Quantities read as UI-37 says; names and notes carry dir="auto"
// (UI-41). The panel starts closed so the step stays the screen's focus
// (Rotem delegated, chat 2026-09-30).
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import type { Ingredient } from '@rsn/shared/util-domain';
// UI-37: the same quantity wording as the detail screen's ingredient list.
import { formatQuantity } from '@rsn/shared/util-domain';
import { Button, Icon } from '@rsn/web/ui';

export interface CookIngredientsProps {
  ingredients: readonly Ingredient[];
  /** The servings the recipe is written for (§3.1.1). */
  servings: number;
}

/** UI-15: the toggle and, when open, the list at the recipe's servings. */
export function CookIngredients({
  ingredients,
  servings,
}: CookIngredientsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <section className="mt-4">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <Icon.ArrowUp size={15} /> : <Icon.ArrowDown size={15} />}
        Ingredients
      </Button>
      {open ? (
        // A long list scrolls inside the panel instead of pushing the step away.
        <div id={listId} className="cook-panel">
          {/* UI-37: "1 serving", "N servings". */}
          <div className="text-muted text-small">
            {servings === 1 ? 'For 1 serving' : `For ${servings} servings`}
          </div>
          {ingredients.length === 0 ? (
            <p className="text-muted text-body">
              This recipe lists no ingredients.
            </p>
          ) : (
            <ul className="list-reset stack">
              {ingredients.map((ingredient, index) => (
                <li
                  // §3.1.1 ingredients are an ordered list and may repeat a name.
                  key={`${index}-${ingredient.name}`}
                  className="ingredient-row"
                >
                  <span className="ingredient-qty">
                    {formatQuantity(ingredient.quantity, ingredient.unit)}
                  </span>
                  <span>
                    <span dir="auto">{ingredient.name}</span>{' '}
                    {ingredient.note === undefined ||
                    ingredient.note === '' ? null : (
                      <span className="text-muted text-small" dir="auto">
                        {ingredient.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

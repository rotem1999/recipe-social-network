// SPEC.md UI-14 (the servings stepper rescales on screen only and is capped at
// 6, §3.1.1), UI-37 ("1 serving" / "N servings", unit plurals and kitchen
// fractions) and UI-41 (ingredient names and notes carry dir="auto"). The panel
// is presentational, so it needs no API mock.
import { fireEvent, render, screen } from '@testing-library/react';
import type { Ingredient } from '@rsn/shared/util-domain';
import { IngredientsPanel } from './ingredients-panel';

function stepper(name: 'More servings' | 'Fewer servings'): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

function quantities(): string[] {
  return Array.from(document.querySelectorAll('.ingredient-qty')).map(
    (element) => element.textContent ?? '',
  );
}

describe('IngredientsPanel', () => {
  it('UI-14 §3.1.1 stops the stepper at 6 servings', () => {
    render(
      <IngredientsPanel
        ingredients={[{ quantity: 100, unit: 'g', name: 'rice' }]}
        servings={5}
      />,
    );

    expect(stepper('More servings').disabled).toBe(false);
    fireEvent.click(stepper('More servings'));

    expect(screen.getByText('6 servings')).toBeTruthy();
    expect(screen.getByText('120 g')).toBeTruthy();
    expect(stepper('More servings').disabled).toBe(true);

    fireEvent.click(stepper('More servings'));
    expect(screen.getByText('6 servings')).toBeTruthy();
    expect(screen.queryByText('7 servings')).toBeNull();
  });

  it('UI-14 stops the stepper at 1 serving', () => {
    render(
      <IngredientsPanel
        ingredients={[{ quantity: 100, unit: 'g', name: 'rice' }]}
        servings={2}
      />,
    );

    fireEvent.click(stepper('Fewer servings'));

    expect(screen.getByText('50 g')).toBeTruthy();
    expect(stepper('Fewer servings').disabled).toBe(true);
    fireEvent.click(stepper('Fewer servings'));
    expect(screen.queryByText('0 servings')).toBeNull();
  });

  it('UI-14 starts again from the recipe servings when a different version arrives', () => {
    const ingredients: Ingredient[] = [
      { quantity: 100, unit: 'g', name: 'rice' },
    ];
    const { rerender } = render(
      <IngredientsPanel ingredients={ingredients} servings={2} />,
    );
    fireEvent.click(stepper('More servings'));
    expect(screen.getByText('3 servings')).toBeTruthy();

    rerender(<IngredientsPanel ingredients={ingredients} servings={4} />);

    expect(screen.getByText('4 servings')).toBeTruthy();
    expect(screen.getByText('100 g')).toBeTruthy();
  });

  it('UI-37 reads "1 serving" in the singular and "N servings" otherwise', () => {
    render(
      <IngredientsPanel
        ingredients={[{ quantity: 1, unit: 'piece', name: 'onion' }]}
        servings={1}
      />,
    );

    expect(screen.getByText('1 serving')).toBeTruthy();
    fireEvent.click(stepper('More servings'));
    expect(screen.getByText('2 servings')).toBeTruthy();
  });

  it('UI-37 writes piece and cup in the plural after more than 1 and keeps them singular after 1', () => {
    render(
      <IngredientsPanel
        ingredients={[
          { quantity: 2, unit: 'piece', name: 'onion' },
          { quantity: 3, unit: 'cup', name: 'stock' },
          { quantity: 1, unit: 'cup', name: 'rice' },
          { quantity: 1, unit: 'piece', name: 'lemon' },
        ]}
        servings={2}
      />,
    );

    expect(quantities()).toEqual(['2 pieces', '3 cups', '1 cup', '1 piece']);
  });

  it('UI-37 shows kitchen fractions for cup, tbsp and tsp, singular below 1', () => {
    render(
      <IngredientsPanel
        ingredients={[
          { quantity: 0.75, unit: 'cup', name: 'milk' },
          { quantity: 0.5, unit: 'cup', name: 'sugar' },
          { quantity: 1.5, unit: 'cup', name: 'flour' },
          { quantity: 1.5, unit: 'tbsp', name: 'oil' },
          { quantity: 0.33, unit: 'tsp', name: 'salt' },
          { quantity: 0.4, unit: 'cup', name: 'cream' },
        ]}
        servings={2}
      />,
    );

    expect(quantities()).toEqual([
      '¾ cup',
      '½ cup',
      '1½ cups',
      '1½ tbsp',
      '⅓ tsp',
      '0.4 cups',
    ]);
  });

  it('UI-37 turns a rescaled quantity into its fraction', () => {
    render(
      <IngredientsPanel
        ingredients={[{ quantity: 0.25, unit: 'cup', name: 'milk' }]}
        servings={1}
      />,
    );

    fireEvent.click(stepper('More servings'));
    fireEvent.click(stepper('More servings'));

    expect(quantities()).toEqual(['¾ cup']);
  });

  it('§3.1.1 shows an empty quantity as "to taste"', () => {
    render(
      <IngredientsPanel
        ingredients={[{ quantity: null, unit: 'none', name: 'salt' }]}
        servings={2}
      />,
    );

    expect(quantities()).toEqual(['to taste']);
  });

  it('UI-41 gives ingredient names and notes dir="auto"', () => {
    render(
      <IngredientsPanel
        ingredients={[
          { quantity: 2, unit: 'piece', name: 'בצל', note: 'קצוץ' },
        ]}
        servings={2}
      />,
    );

    expect(screen.getByText('בצל').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('קצוץ').getAttribute('dir')).toBe('auto');
  });
});

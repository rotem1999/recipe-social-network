// SPEC §3.3 CAT-4/CAT-5/CAT-6 (§16 M5, M7): the pure TheMealDB mappers. The
// meal fields used here are the ones §16 M7 lists; no network is touched.

import {
  THEMEALDB_ATTRIBUTION,
  parseMeasure,
  toCatalogueItem,
  toCataloguePreview,
  toIngredients,
  toRecipeContent,
  toSteps,
} from './mapper';
import type { MealRecord } from './meal-record';

function meal(overrides: Partial<MealRecord> = {}): MealRecord {
  return {
    idMeal: '52772',
    strMeal: 'Teriyaki Chicken Casserole',
    strCategory: 'Chicken',
    strArea: 'Japanese',
    strInstructions: 'Preheat oven to 180 C.',
    strMealThumb: 'https://www.themealdb.com/images/media/meals/test.jpg',
    ...overrides,
  } as MealRecord;
}

describe('parseMeasure', () => {
  it('CAT-6 reads a whole number followed by a unit word', () => {
    expect(parseMeasure('2 cups')).toEqual({ quantity: 2, unit: 'cup' });
  });

  it('CAT-6 reads the ascii fraction `1/2 cup`', () => {
    expect(parseMeasure('1/2 cup')).toEqual({ quantity: 0.5, unit: 'cup' });
  });

  it('CAT-6 reads the mixed number `1 1/2 tsp`', () => {
    expect(parseMeasure('1 1/2 tsp')).toEqual({ quantity: 1.5, unit: 'tsp' });
  });

  it('CAT-6 reads the unicode fraction `½ tsp`', () => {
    expect(parseMeasure('½ tsp')).toEqual({ quantity: 0.5, unit: 'tsp' });
  });

  it('CAT-6 keeps the leftover words of a measure as the note', () => {
    expect(parseMeasure('1 tbsp chopped')).toEqual({
      quantity: 1,
      unit: 'tbsp',
      note: 'chopped',
    });
  });

  it('CAT-6 keeps `4 oz` raw because oz is outside the fixed unit list', () => {
    expect(parseMeasure('4 oz')).toEqual({
      quantity: null,
      unit: 'none',
      note: '4 oz',
    });
  });

  it('CAT-6 keeps a measure with no leading number raw', () => {
    expect(parseMeasure('to taste')).toEqual({
      quantity: null,
      unit: 'none',
      note: 'to taste',
    });
  });

  it('CAT-6 yields no quantity, unit none and no note for an empty measure', () => {
    const parsed = parseMeasure('');
    expect(parsed).toEqual({ quantity: null, unit: 'none' });
    expect('note' in parsed).toBe(false);
  });

  it('CAT-6 treats whitespace, null and undefined measures as empty', () => {
    expect(parseMeasure('   ')).toEqual({ quantity: null, unit: 'none' });
    expect(parseMeasure(null)).toEqual({ quantity: null, unit: 'none' });
    expect(parseMeasure(undefined)).toEqual({ quantity: null, unit: 'none' });
  });

  it('CAT-6 accepts the spelled-out and abbreviated forms of a unit', () => {
    expect(parseMeasure('3 teaspoons')).toEqual({ quantity: 3, unit: 'tsp' });
    expect(parseMeasure('2 tbsps')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(parseMeasure('1 pinch')).toEqual({ quantity: 1, unit: 'pinch' });
  });
});

describe('toIngredients', () => {
  it('CAT-6 skips both the `""` and the `null` empty slots (§16 M7)', () => {
    const ingredients = toIngredients(
      meal({
        strIngredient1: 'Soy sauce',
        strMeasure1: '3/4 cup',
        strIngredient2: 'Water',
        strMeasure2: '1/2 cup',
        strIngredient10: '',
        strMeasure10: '',
        strIngredient16: null,
        strMeasure16: null,
        strIngredient17: '   ',
      }),
    );

    expect(ingredients).toEqual([
      { name: 'Soy sauce', quantity: 0.75, unit: 'cup' },
      { name: 'Water', quantity: 0.5, unit: 'cup' },
    ]);
  });

  it('CAT-6 keeps the slot order and trims the ingredient name', () => {
    const ingredients = toIngredients(
      meal({
        strIngredient1: ' Chicken ',
        strMeasure1: '4 oz',
        strIngredient3: 'Brown sugar',
        strMeasure3: '1/4 cup',
      }),
    );

    expect(ingredients.map((item) => item.name)).toEqual([
      'Chicken',
      'Brown sugar',
    ]);
    expect(ingredients[0]).toEqual({
      name: 'Chicken',
      quantity: null,
      unit: 'none',
      note: '4 oz',
    });
  });

  it('CAT-6 returns an empty list when every slot is empty', () => {
    expect(toIngredients(meal())).toEqual([]);
  });
});

describe('toSteps', () => {
  it('CAT-6 splits the instruction blob on line breaks and drops empty steps', () => {
    const steps = toSteps('Preheat the oven.\r\n\r\n   \nBake for 20 minutes.\n');

    expect(steps).toEqual([
      { text: 'Preheat the oven.' },
      { text: 'Bake for 20 minutes.' },
    ]);
  });

  it('CAT-6 strips `1.`, `2)` and `STEP 3` prefixes from a step', () => {
    const steps = toSteps(
      ['1. Chop the onion', '2) Fry it', 'STEP 3: Serve'].join('\n'),
    );

    expect(steps.map((step) => step.text)).toEqual([
      'Chop the onion',
      'Fry it',
      'Serve',
    ]);
  });

  it('CAT-6 keeps a paragraph of at most 300 characters as one step', () => {
    const paragraph = `Simmer ${'gently '.repeat(30)}until done.`;
    expect(paragraph.length).toBeLessThanOrEqual(300);

    expect(toSteps(paragraph)).toEqual([{ text: paragraph.trim() }]);
  });

  it('CAT-6 splits a paragraph over 300 characters on sentence ends', () => {
    const first = `Boil the pasta ${'very '.repeat(40)}slowly.`;
    const second = `Drain it ${'very '.repeat(40)}carefully.`;
    expect(`${first} ${second}`.length).toBeGreaterThan(300);

    const steps = toSteps(`${first} ${second}`);

    expect(steps).toHaveLength(2);
    expect(steps[0].text).toBe(first);
    expect(steps[1].text).toBe(second);
    for (const step of steps) {
      expect(step.text.length).toBeLessThanOrEqual(300);
    }
  });

  it('CAT-6 returns an empty list for missing instructions', () => {
    expect(toSteps(null)).toEqual([]);
    expect(toSteps(undefined)).toEqual([]);
    expect(toSteps('   \n  ')).toEqual([]);
  });
});

describe('toRecipeContent', () => {
  it('CAT-4 gives a saved catalogue recipe 2 servings', () => {
    expect(toRecipeContent(meal()).servings).toBe(2);
  });

  it('CAT-5 keeps a `strCategory` that is one of the 14 categories', () => {
    expect(toRecipeContent(meal({ strCategory: 'Beef' })).category).toBe('Beef');
  });

  it('CAT-5 falls back to Miscellaneous for an unknown category', () => {
    expect(toRecipeContent(meal({ strCategory: 'Fusion' })).category).toBe(
      'Miscellaneous',
    );
    expect(toRecipeContent(meal({ strCategory: null })).category).toBe(
      'Miscellaneous',
    );
  });

  it('CAT-6 maps title, ingredients and steps of the meal object', () => {
    const content = toRecipeContent(
      meal({
        strMeal: '  Teriyaki Chicken Casserole  ',
        strIngredient1: 'Soy sauce',
        strMeasure1: '3/4 cup',
        strInstructions: 'Preheat the oven.\nBake for 20 minutes.',
      }),
    );

    expect(content.title).toBe('Teriyaki Chicken Casserole');
    expect(content.ingredients).toEqual([
      { name: 'Soy sauce', quantity: 0.75, unit: 'cup' },
    ]);
    expect(content.steps).toEqual([
      { text: 'Preheat the oven.' },
      { text: 'Bake for 20 minutes.' },
    ]);
  });
});

describe('toCatalogueItem', () => {
  it('DISC-9 maps a filter.php row onto a catalogue entry of the asked category', () => {
    expect(
      toCatalogueItem(
        {
          idMeal: '52874',
          strMeal: ' Beef and Mustard Pie ',
          strMealThumb: 'https://www.themealdb.com/images/media/meals/pie.jpg',
        },
        'Beef',
      ),
    ).toEqual({
      mealId: '52874',
      name: 'Beef and Mustard Pie',
      thumbnailUrl: 'https://www.themealdb.com/images/media/meals/pie.jpg',
      category: 'Beef',
    });
  });

  it('DISC-9 uses an empty thumbnail when the row carries none', () => {
    expect(
      toCatalogueItem({ idMeal: '1', strMeal: 'X', strMealThumb: null }, 'Side')
        .thumbnailUrl,
    ).toBe('');
  });
});

describe('toCataloguePreview', () => {
  it('CAT-2 returns the recipe content plus meal id, thumbnail and area', () => {
    const preview = toCataloguePreview(meal({ strArea: ' Japanese ' }));

    expect(preview.mealId).toBe('52772');
    expect(preview.servings).toBe(2);
    expect(preview.thumbnailUrl).toBe(
      'https://www.themealdb.com/images/media/meals/test.jpg',
    );
    expect(preview.area).toBe('Japanese');
  });

  it('CAT-2 leaves the area null when the meal has none', () => {
    expect(toCataloguePreview(meal({ strArea: '  ' })).area).toBe(null);
    expect(toCataloguePreview(meal({ strArea: null })).area).toBe(null);
  });

  it('CAT-1 carries the exact attribution string TheMealDB requires (§16 M5)', () => {
    expect(toCataloguePreview(meal()).attribution).toBe(THEMEALDB_ATTRIBUTION);
    expect(THEMEALDB_ATTRIBUTION).toBe(
      'Recipe data and imagery: TheMealDB (https://www.themealdb.com/)',
    );
  });
});

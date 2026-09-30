import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  DEFAULT_CATALOGUE_SERVINGS,
  MAX_FAVOURITE_CATEGORIES,
  MAX_IMAGES_PER_RECIPE,
  MAX_IMAGE_BYTES,
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  MAX_COOK_TIMER_MINUTES,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_QUANTITY,
  MAX_PREP_COOK_MINUTES,
  MAX_SERVINGS,
  MAX_STARS,
  MAX_STEPS,
  MAX_STEP_DURATION_MINUTES,
  MIN_PREP_COOK_MINUTES,
  MIN_SERVINGS,
  MIN_STARS,
  MIN_STEP_DURATION_MINUTES,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  STEP_TEXT_MAX_LENGTH,
  UNITS,
  VISIBILITIES,
  greetingFor,
  isCategory,
  isUnit,
  isVisibility,
  isWholeStars,
  roundToQuarter,
  scaleQuantity,
  toTwoDecimals,
  totalMinutes,
  validateRecipeContent,
  type RecipeContent,
} from './util-domain';

/** A minimal valid recipe per SPEC §3.1.1; each test overrides one field. */
function makeContent(overrides: Partial<RecipeContent> = {}): RecipeContent {
  return {
    title: 'Shakshuka',
    description: 'Eggs poached in a spiced tomato sauce.',
    category: 'Breakfast',
    servings: 2,
    ingredients: [
      { quantity: 4, unit: 'piece', name: 'egg' },
      { quantity: null, unit: 'none', name: 'salt', note: 'to taste' },
    ],
    steps: [
      { text: 'Fry the onion and pepper.', durationMinutes: 5 },
      { text: 'Add the tomatoes and simmer.' },
    ],
    prepMinutes: 10,
    cookMinutes: 20,
    ...overrides,
  };
}

describe('CATEGORIES', () => {
  it('DISC-7 holds exactly TheMealDB’s 14 category names', () => {
    expect(CATEGORIES).toEqual([
      'Beef',
      'Breakfast',
      'Chicken',
      'Dessert',
      'Goat',
      'Lamb',
      'Miscellaneous',
      'Pasta',
      'Pork',
      'Seafood',
      'Side',
      'Starter',
      'Vegan',
      'Vegetarian',
    ]);
    expect(CATEGORIES).toHaveLength(14);
  });

  it('DISC-7 has no duplicate names', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });

  it('DISC-8 isCategory accepts a listed name and rejects anything else', () => {
    expect(isCategory('Seafood')).toBe(true);
    expect(isCategory('seafood')).toBe(false);
    expect(isCategory('Cuisine')).toBe(false);
    expect(isCategory(undefined)).toBe(false);
    expect(isCategory(3)).toBe(false);
  });
});

describe('UNITS', () => {
  it('§3.1.1 holds the fixed unit list', () => {
    expect(UNITS).toEqual(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'pinch', 'none']);
  });

  it('§3.1.1 isUnit accepts a listed unit and rejects anything else', () => {
    expect(isUnit('tbsp')).toBe(true);
    expect(isUnit('oz')).toBe(false);
    expect(isUnit(null)).toBe(false);
  });
});

describe('VISIBILITIES', () => {
  it('REC-1 lists private, shared and public', () => {
    expect(VISIBILITIES).toEqual(['private', 'shared', 'public']);
  });

  it('REC-1 isVisibility accepts a listed state and rejects anything else', () => {
    expect(isVisibility('shared')).toBe(true);
    expect(isVisibility('friends')).toBe(false);
  });
});

describe('domain constants', () => {
  it('RATE-1 bounds whole stars at 1 and 5', () => {
    expect(MIN_STARS).toBe(1);
    expect(MAX_STARS).toBe(5);
  });

  it('DISC-6 pins at most 3 favourite categories', () => {
    expect(MAX_FAVOURITE_CATEGORIES).toBe(3);
  });

  it('CAT-4 gives catalogue imports 2 servings', () => {
    expect(DEFAULT_CATALOGUE_SERVINGS).toBe(2);
  });

  it('IMG-6 allows 3 images of at most 5 MB each', () => {
    expect(MAX_IMAGES_PER_RECIPE).toBe(3);
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('§3.1.1 limits the title to 200 and the description to 500 characters', () => {
    expect(RECIPE_TITLE_MAX_LENGTH).toBe(200);
    expect(RECIPE_DESCRIPTION_MAX_LENGTH).toBe(500);
  });

  it('§3.1.1 allows 1 to 6 servings', () => {
    expect(MIN_SERVINGS).toBe(1);
    expect(MAX_SERVINGS).toBe(6);
  });

  it('§3.1.1 allows prepMinutes and cookMinutes from 0 to 1440', () => {
    expect(MIN_PREP_COOK_MINUTES).toBe(0);
    expect(MAX_PREP_COOK_MINUTES).toBe(1440);
  });

  it('§3.1.1 allows at most 50 ingredients, names and notes of 120 characters, quantities up to 10000', () => {
    expect(MAX_INGREDIENTS).toBe(50);
    expect(INGREDIENT_NAME_MAX_LENGTH).toBe(120);
    expect(INGREDIENT_NOTE_MAX_LENGTH).toBe(120);
    expect(MAX_INGREDIENT_QUANTITY).toBe(10000);
  });

  it('§3.1.1 allows at most 60 steps of 1000 characters with a duration from 1 to 1440 minutes', () => {
    expect(MAX_STEPS).toBe(60);
    expect(STEP_TEXT_MAX_LENGTH).toBe(1000);
    expect(MIN_STEP_DURATION_MINUTES).toBe(1);
    expect(MAX_STEP_DURATION_MINUTES).toBe(1440);
  });

  it('UI-15, §3.1.1 offers a cook-mode timer only up to 120 minutes, below the step duration limit', () => {
    expect(MAX_COOK_TIMER_MINUTES).toBe(120);
    expect(MAX_COOK_TIMER_MINUTES).toBeLessThan(MAX_STEP_DURATION_MINUTES);
  });
});

describe('isWholeStars', () => {
  it('RATE-1 accepts every whole star from 1 to 5', () => {
    expect([1, 2, 3, 4, 5].map((stars) => isWholeStars(stars))).toEqual([true, true, true, true, true]);
  });

  it('RATE-1 rejects values outside 1..5', () => {
    expect(isWholeStars(0)).toBe(false);
    expect(isWholeStars(6)).toBe(false);
    expect(isWholeStars(-1)).toBe(false);
  });

  it('RATE-1 rejects fractional stars', () => {
    expect(isWholeStars(3.5)).toBe(false);
    expect(isWholeStars(4.75)).toBe(false);
  });

  it('RATE-1 rejects non-numeric input', () => {
    expect(isWholeStars('4')).toBe(false);
    expect(isWholeStars(null)).toBe(false);
    expect(isWholeStars(undefined)).toBe(false);
    expect(isWholeStars(Number.NaN)).toBe(false);
  });
});

describe('roundToQuarter', () => {
  it('RATE-3 rounds 4.6 down to 4.5', () => {
    expect(roundToQuarter(4.6)).toBe(4.5);
  });

  it('RATE-3 rounds 4.7 up to 4.75', () => {
    expect(roundToQuarter(4.7)).toBe(4.75);
  });

  it('RATE-3 rounds 4.88 up to 5', () => {
    expect(roundToQuarter(4.88)).toBe(5);
  });

  it('RATE-3 keeps a value that is already a quarter step', () => {
    expect(roundToQuarter(1)).toBe(1);
    expect(roundToQuarter(3.25)).toBe(3.25);
    expect(roundToQuarter(4.5)).toBe(4.5);
  });

  it('RATE-3 only ever returns quarter steps inside the 1..5 range', () => {
    for (let average = 1; average <= 5; average += 0.01) {
      const rounded = roundToQuarter(toTwoDecimals(average));
      expect(Number.isInteger(rounded * 4)).toBe(true);
      expect(rounded).toBeGreaterThanOrEqual(MIN_STARS);
      expect(rounded).toBeLessThanOrEqual(MAX_STARS);
    }
  });
});

describe('toTwoDecimals', () => {
  it('RATE-2 keeps two digits after the decimal point', () => {
    expect(toTwoDecimals(4.3333333)).toBe(4.33);
    expect(toTwoDecimals(4.666)).toBe(4.67);
  });

  it('RATE-2 leaves a whole average unchanged', () => {
    expect(toTwoDecimals(5)).toBe(5);
    expect(toTwoDecimals(1)).toBe(1);
  });

  it('RATE-2 rounds the average of whole stars into the 1.00-5.00 range', () => {
    expect(toTwoDecimals((5 + 4 + 4) / 3)).toBe(4.33);
    expect(toTwoDecimals((1 + 2) / 2)).toBe(1.5);
  });

  it('RATE-2 is idempotent on an already rounded value', () => {
    expect(toTwoDecimals(toTwoDecimals(3.14159))).toBe(3.14);
  });
});

describe('validateRecipeContent', () => {
  it('§3.1.1 returns no errors for valid content', () => {
    expect(validateRecipeContent(makeContent())).toEqual([]);
  });

  it('§3.1.1 accepts content with only the required fields', () => {
    const content: RecipeContent = {
      title: 'Toast',
      category: 'Side',
      servings: 1,
      ingredients: [{ quantity: 2, unit: 'piece', name: 'bread' }],
      steps: [{ text: 'Toast the bread.' }],
    };
    expect(validateRecipeContent(content)).toEqual([]);
  });

  it('§3.1.1 requires a title', () => {
    expect(validateRecipeContent(makeContent({ title: '' }))).toContain('Give the recipe a title');
    expect(validateRecipeContent(makeContent({ title: '   ' }))).toContain('Give the recipe a title');
  });

  it('§3.1.1 requires the category to be one of the 14 categories', () => {
    const content = makeContent({ category: 'Cuisine' as RecipeContent['category'] });
    expect(validateRecipeContent(content)).toContain('Choose a category');
  });

  it('§3.1.1 requires servings to be an integer >= 1', () => {
    expect(validateRecipeContent(makeContent({ servings: 0 }))).toContain('Servings must be a whole number of at least 1');
    expect(validateRecipeContent(makeContent({ servings: -2 }))).toContain('Servings must be a whole number of at least 1');
    expect(validateRecipeContent(makeContent({ servings: 2.5 }))).toContain('Servings must be a whole number of at least 1');
    expect(validateRecipeContent(makeContent({ servings: 1 }))).toEqual([]);
  });

  it('§3.1.1 requires at least one ingredient', () => {
    expect(validateRecipeContent(makeContent({ ingredients: [] }))).toContain('Add at least one ingredient');
  });

  it('§3.1.1 requires at least one step', () => {
    expect(validateRecipeContent(makeContent({ steps: [] }))).toContain('Add at least one step');
  });

  it('§3.1.1 reports the 1-based position of an ingredient without a name', () => {
    const content = makeContent({
      ingredients: [
        { quantity: 1, unit: 'cup', name: 'flour' },
        { quantity: 1, unit: 'tsp', name: '  ' },
      ],
    });
    expect(validateRecipeContent(content)).toEqual(['Name ingredient 2']);
  });

  it('§3.1.1 rejects an ingredient unit outside the fixed list', () => {
    const content = makeContent({
      ingredients: [{ quantity: 1, unit: 'ounce' as never, name: 'butter' }],
    });
    expect(validateRecipeContent(content)).toEqual(['Choose a unit for ingredient 1']);
  });

  it('§3.1.1 allows an empty quantity as "to taste" but rejects a negative one', () => {
    const toTaste = makeContent({ ingredients: [{ quantity: null, unit: 'pinch', name: 'salt' }] });
    expect(validateRecipeContent(toTaste)).toEqual([]);

    const negative = makeContent({ ingredients: [{ quantity: -1, unit: 'g', name: 'salt' }] });
    expect(validateRecipeContent(negative)).toEqual([
      "Ingredient 1: the quantity can't be negative",
    ]);
  });

  it('§3.1.1 accepts a decimal quantity', () => {
    const content = makeContent({ ingredients: [{ quantity: 0.5, unit: 'l', name: 'milk' }] });
    expect(validateRecipeContent(content)).toEqual([]);
  });

  it('§3.1.1 reports the 1-based position of a step without text', () => {
    const content = makeContent({ steps: [{ text: 'Mix.' }, { text: '' }] });
    expect(validateRecipeContent(content)).toEqual(['Write step 2']);
  });

  it('§3.1.1 requires a step durationMinutes to be an integer >= 1', () => {
    expect(validateRecipeContent(makeContent({ steps: [{ text: 'Rest.', durationMinutes: 0 }] }))).toEqual([
      'Step 1: minutes must be a whole number of at least 1',
    ]);
    expect(validateRecipeContent(makeContent({ steps: [{ text: 'Rest.', durationMinutes: 1.5 }] }))).toEqual([
      'Step 1: minutes must be a whole number of at least 1',
    ]);
    expect(validateRecipeContent(makeContent({ steps: [{ text: 'Rest.', durationMinutes: 1 }] }))).toEqual([]);
  });

  it('§3.1.1 requires prepMinutes and cookMinutes to be integers >= 0 when present', () => {
    expect(validateRecipeContent(makeContent({ prepMinutes: -1 }))).toContain('Prep minutes must be a whole number, 0 or more');
    expect(validateRecipeContent(makeContent({ cookMinutes: 12.5 }))).toContain('Cook minutes must be a whole number, 0 or more');
    expect(validateRecipeContent(makeContent({ prepMinutes: 0, cookMinutes: 0 }))).toEqual([]);
    expect(validateRecipeContent(makeContent({ prepMinutes: undefined, cookMinutes: undefined }))).toEqual([]);
  });

  it('§3.1.1 collects every error at once', () => {
    const content = makeContent({
      title: '',
      category: 'Nope' as RecipeContent['category'],
      servings: 0,
      ingredients: [],
      steps: [],
    });
    expect(validateRecipeContent(content)).toEqual([
      'Give the recipe a title',
      'Choose a category',
      'Servings must be a whole number of at least 1',
      'Add at least one ingredient',
      'Add at least one step',
    ]);
  });

  it('§3.1.1 rejects a title longer than 200 characters', () => {
    expect(validateRecipeContent(makeContent({ title: 'a'.repeat(201) }))).toEqual([
      'Title can be at most 200 characters',
    ]);
    expect(validateRecipeContent(makeContent({ title: 'a'.repeat(200) }))).toEqual([]);
  });

  it('§3.1.1 rejects a description longer than 500 characters', () => {
    expect(validateRecipeContent(makeContent({ description: 'a'.repeat(501) }))).toEqual([
      'Description can be at most 500 characters',
    ]);
    expect(validateRecipeContent(makeContent({ description: 'a'.repeat(500) }))).toEqual([]);
  });

  it('UI-43 words every message for people, with 1-based positions and no field names', () => {
    const content = makeContent({
      title: 'a'.repeat(201),
      description: 'd'.repeat(501),
      ingredients: [
        { quantity: 1, unit: 'cup', name: 'flour' },
        { quantity: 1, unit: 'cup', name: 'sugar' },
        { quantity: -3, unit: 'ounce' as never, name: '' },
      ],
      steps: [{ text: 'Mix.' }, { text: 'Rest.', durationMinutes: 0 }, { text: ' ' }],
      prepMinutes: -5,
      cookMinutes: -1,
    });

    const messages = validateRecipeContent(content);

    expect(messages).toEqual([
      'Title can be at most 200 characters',
      'Description can be at most 500 characters',
      'Name ingredient 3',
      'Choose a unit for ingredient 3',
      "Ingredient 3: the quantity can't be negative",
      'Step 2: minutes must be a whole number of at least 1',
      'Write step 3',
      'Prep minutes must be a whole number, 0 or more',
      'Cook minutes must be a whole number, 0 or more',
    ]);
    for (const message of messages) {
      expect(message).not.toMatch(/prepMinutes|cookMinutes|durationMinutes|servings must be an integer|>=/);
    }
  });

  it.each([
    ['2.5 servings', { servings: 2.5 }, 'Servings must be a whole number of at least 1'],
    ['12.5 cook minutes', { cookMinutes: 12.5 }, 'Cook minutes must be a whole number, 0 or more'],
    ['12.5 prep minutes', { prepMinutes: 12.5 }, 'Prep minutes must be a whole number, 0 or more'],
    [
      'a 1.5-minute step',
      { steps: [{ text: 'Rest.', durationMinutes: 1.5 }] },
      'Step 1: minutes must be a whole number of at least 1',
    ],
  ])('UI-43 answers %s, which is not a whole number, with a sentence that says so', (_name, overrides, expected) => {
    const messages = validateRecipeContent(makeContent(overrides as Partial<RecipeContent>));

    expect(messages).toEqual([expected]);
    expect(expected).not.toMatch(/can't be negative/);
  });
});

describe('scaleQuantity', () => {
  it('UI-14 doubles a quantity when the servings double', () => {
    expect(scaleQuantity(200, 2, 4)).toBe(400);
  });

  it('UI-14 halves a quantity when the servings halve', () => {
    expect(scaleQuantity(200, 4, 2)).toBe(100);
  });

  it('UI-14 returns the same quantity when the servings do not change', () => {
    expect(scaleQuantity(1.5, 3, 3)).toBe(1.5);
  });

  it('UI-14 rounds the scaled quantity to two decimals', () => {
    expect(scaleQuantity(1, 3, 1)).toBe(0.33);
    expect(scaleQuantity(2, 3, 1)).toBe(0.67);
  });

  it('UI-14 keeps an empty "to taste" quantity empty', () => {
    expect(scaleQuantity(null, 2, 6)).toBeNull();
  });

  it('UI-14 leaves the quantity untouched when the source servings are not positive', () => {
    expect(scaleQuantity(200, 0, 4)).toBe(200);
    expect(scaleQuantity(200, -2, 4)).toBe(200);
  });
});

describe('totalMinutes', () => {
  it('UI-10 sums prepMinutes and cookMinutes', () => {
    expect(totalMinutes({ prepMinutes: 10, cookMinutes: 20 })).toBe(30);
  });

  it('UI-10 counts the one value present as the total', () => {
    expect(totalMinutes({ prepMinutes: 15, cookMinutes: undefined })).toBe(15);
    expect(totalMinutes({ prepMinutes: undefined, cookMinutes: 25 })).toBe(25);
  });

  it('UI-10 returns undefined when both are absent so the card omits the line', () => {
    expect(totalMinutes({})).toBeUndefined();
    expect(totalMinutes({ prepMinutes: undefined, cookMinutes: undefined })).toBeUndefined();
  });

  it('UI-10 returns 0 rather than undefined when a value is present and zero', () => {
    expect(totalMinutes({ prepMinutes: 0 })).toBe(0);
  });
});

describe('greetingFor', () => {
  it('UI-10 greets "Good morning" from hour 5 to hour 11', () => {
    for (let hour = 5; hour <= 11; hour += 1) {
      expect(greetingFor(hour)).toBe('Good morning');
    }
  });

  it('UI-10 greets "Good afternoon" from hour 12 to hour 17', () => {
    for (let hour = 12; hour <= 17; hour += 1) {
      expect(greetingFor(hour)).toBe('Good afternoon');
    }
  });

  it('UI-10 greets "Good evening" for every other hour of the day', () => {
    for (const hour of [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4]) {
      expect(greetingFor(hour)).toBe('Good evening');
    }
  });
});

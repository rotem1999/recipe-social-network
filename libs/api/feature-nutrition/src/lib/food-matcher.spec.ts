// SPEC §9 NUT-8 (§16 U11, U13): which FoodData Central search hit an
// ingredient name means. Pure functions, no I/O; hits use the §9 field names.
import type { UsdaFoodHit } from '@rsn/api/data-access-usda';

import { chooseFood, scoreHit, strictQuery } from './food-matcher';

let nextFdcId = 1;

function hit(
  description: string,
  overrides: Partial<UsdaFoodHit> = {},
): UsdaFoodHit {
  return {
    fdcId: nextFdcId++,
    description,
    dataType: 'SR Legacy',
    kcalPer100g: 100,
    gramWeightPerMeasure: null,
    ...overrides,
  };
}

function descriptionOf(chosen: UsdaFoodHit | null): string | null {
  return chosen === null ? null : chosen.description;
}

describe('strictQuery (NUT-8)', () => {
  it('NUT-8 requires every name word with `+` and adds the optional word `raw`', () => {
    expect(strictQuery('Ground Beef')).toBe('+ground +beef raw');
  });

  it('NUT-8 lower-cases the words and keeps them unsingularised for USDA', () => {
    expect(strictQuery('Plum Tomatoes')).toBe('+plum +tomatoes raw');
    expect(strictQuery('Garlic')).toBe('+garlic raw');
  });

  it('NUT-8 keeps accented letters in the required words ("Jalapeño Peppers")', () => {
    expect(strictQuery('Jalapeño Peppers')).toBe('+jalapeño +peppers raw');
    expect(strictQuery('Gruyère')).toBe('+gruyère raw');
  });

  it('NUT-8 keeps digits as words ("00 Flour")', () => {
    expect(strictQuery('00 Flour')).toBe('+00 +flour raw');
  });

  it('NUT-8 splits on anything that is neither a letter nor a digit', () => {
    expect(strictQuery("Za'atar")).toBe('+za +atar raw');
    expect(strictQuery('All-Purpose Flour')).toBe('+all +purpose +flour raw');
  });

  it('NUT-8 splits on punctuation and collapses repeated separators', () => {
    expect(strictQuery('  Chicken   Breast, boneless ')).toBe(
      '+chicken +breast +boneless raw',
    );
  });
});

describe('scoreHit (NUT-8)', () => {
  it('NUT-8 skips a hit with no energy value', () => {
    expect(scoreHit('Garlic', hit('Garlic, raw', { kcalPer100g: null }))).toBe(
      null,
    );
  });

  it('NUT-8 skips a hit whose description lacks the head word ("Plum, raw" for "Plum Tomatoes")', () => {
    expect(scoreHit('Plum Tomatoes', hit('Plum, raw'))).toBe(null);
  });

  it('NUT-8 skips a hit whose first segment has no name word (pretzels are not flour)', () => {
    expect(
      scoreHit(
        'Plain Flour',
        hit('Snacks, pretzels, hard, plain, made with enriched flour'),
      ),
    ).toBe(null);
  });

  it('NUT-8 skips a hit with a segment that is only `skin`, `peel`, `rind` or `juice` not in the name', () => {
    expect(scoreHit('Potatoes', hit('Potatoes, raw, skin'))).toBe(null);
    expect(scoreHit('Lemons', hit('Lemons, raw, peel'))).toBe(null);
    expect(scoreHit('Watermelon', hit('Watermelon, rind'))).toBe(null);
    expect(scoreHit('Lemons', hit('Lemons, juice'))).toBe(null);
  });

  it('NUT-8 keeps a hit whose part word sits in a longer segment ("flesh and skin")', () => {
    expect(scoreHit('Potatoes', hit('Potatoes, flesh and skin, raw'))).toBe(5);
  });

  it('NUT-8 keeps a part-word segment when the part word is a name word', () => {
    // "Potato Skin": `skin` is the head word, so "Potatoes, raw, skin" is wanted.
    expect(scoreHit('Potato Skin', hit('Potatoes, raw, skin'))).not.toBe(null);
  });

  it('NUT-8 skips an empty name', () => {
    expect(scoreHit('', hit('Garlic, raw'))).toBe(null);
  });

  it('NUT-8 scores +3 for a clean first segment and +2 for `raw`', () => {
    expect(scoreHit('Garlic', hit('Garlic, raw'))).toBe(5);
    expect(scoreHit('Garlic', hit('Garlic, cooked'))).toBe(3);
  });

  it('NUT-8 counts `raw`, `fresh`, `whole`, `and`, `or`, `with`, `of` as neutral in the first segment', () => {
    expect(scoreHit('Garlic', hit('Garlic raw fresh whole and or with of'))).toBe(
      5,
    );
  });

  it('NUT-8 counts `nfs` as neutral in the first segment', () => {
    // FNDDS "not further specified": +3 for a clean first segment, no `raw`.
    expect(scoreHit('Rice', hit('Rice NFS'))).toBe(3);
  });

  it('NUT-8 compares the neutral words singularised (`nfs` → `nf`, as descriptions are read)', () => {
    // "NFS" in the first segment is read as `nf`: not foreign, so +3; "raw" +2.
    expect(scoreHit('Pasta', hit('Pasta NFS, raw'))).toBe(5);
  });

  it('NUT-8 matches accented name words against accented descriptions', () => {
    // "jalapeño" and "pepper" both in the first segment: +3, "jalapeño" +2, "raw" +2.
    expect(
      scoreHit('Jalapeño Peppers', hit('Peppers, jalapeño, raw')),
    ).toBe(7);
    expect(scoreHit('Jalapeño Peppers', hit('Peppers, jalapeno, raw'))).toBe(5);
  });

  it('NUT-8 scores −3 per first-segment word that is neither a name word nor neutral', () => {
    // "sauce" is foreign: −3, no `raw`.
    expect(scoreHit('Garlic', hit('Garlic sauce'))).toBe(-3);
    // "spanish" and "rice" foreign: −6; "ground" +2.
    expect(scoreHit('Ground Beef', hit('Spanish rice with ground beef'))).toBe(
      -4,
    );
  });

  it('NUT-8 adds +2 per name word other than the head word found anywhere in the description', () => {
    // first segment "beef" +3, "ground" +2, "raw" +2.
    expect(scoreHit('Ground Beef', hit('Beef, ground, raw'))).toBe(7);
    expect(scoreHit('Ground Beef', hit('Beef, ground'))).toBe(5);
    // "chicken" +3 and +2 as the non-head word, "raw" +2.
    expect(
      scoreHit(
        'Chicken Breast',
        hit('Chicken, breast, boneless, skinless, raw'),
      ),
    ).toBe(7);
  });

  it('NUT-8 compares singularised words ("Eggs" matches "Egg, whole, raw")', () => {
    expect(scoreHit('Eggs', hit('Egg, whole, raw'))).toBe(5);
    expect(scoreHit('Plum Tomatoes', hit('Tomatoes, raw'))).toBe(5);
  });
});

describe('chooseFood (NUT-8)', () => {
  it('NUT-8 "Garlic" → "Garlic, raw", not USDA\'s first hit "Garlic sauce" (§16 U11)', () => {
    const chosen = chooseFood('Garlic', [
      hit('Garlic sauce'),
      hit('Garlic, cooked'),
      hit('Garlic, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe('Garlic, raw');
  });

  it('NUT-8 "Plum Tomatoes" → "Tomatoes, raw" with "Plum, raw" skipped (§16 U11)', () => {
    const chosen = chooseFood('Plum Tomatoes', [
      hit('Plum, raw'),
      hit('Tomatoes, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe('Tomatoes, raw');
  });

  it('NUT-8 "Ground Beef" → "Beef, ground, raw" over "Beef, ground" and a rice dish (§16 U11)', () => {
    const chosen = chooseFood('Ground Beef', [
      hit('Spanish rice with ground beef', { dataType: 'Survey (FNDDS)' }),
      hit('Beef, ground'),
      hit('Beef, ground, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe('Beef, ground, raw');
  });

  it('NUT-8 "Water" → "Water, tap" over "Water convolvulus,raw" (§16 U11)', () => {
    const chosen = chooseFood('Water', [
      hit('Water convolvulus,raw'),
      hit('Water, tap'),
    ]);
    expect(descriptionOf(chosen)).toBe('Water, tap');
  });

  it('NUT-8 "Potatoes" → "Potatoes, flesh and skin, raw", not "Potatoes, raw, skin"', () => {
    const chosen = chooseFood('Potatoes', [
      hit('Potatoes, raw, skin'),
      hit('Potatoes, flesh and skin, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe('Potatoes, flesh and skin, raw');
  });

  it('NUT-8 "Plain Flour" skips the pretzels and takes a flour', () => {
    const chosen = chooseFood('Plain Flour', [
      hit('Snacks, pretzels, hard, plain, made with enriched flour'),
      hit('Wheat flour, white, all-purpose, enriched, bleached'),
    ]);
    expect(descriptionOf(chosen)).toBe(
      'Wheat flour, white, all-purpose, enriched, bleached',
    );
  });

  it('NUT-8 breaks a tie by fewer words ("Butter, tub" over "Butter, Clarified butter (ghee)")', () => {
    const chosen = chooseFood('Butter', [
      hit('Butter, Clarified butter (ghee)'),
      hit('Butter, tub'),
    ]);
    expect(descriptionOf(chosen)).toBe('Butter, tub');
  });

  it('NUT-8 breaks a tie of score and length by USDA\'s order', () => {
    const first = hit('Butter, salted');
    const second = hit('Butter, whipped');
    expect(chooseFood('Butter', [first, second])).toBe(first);
    expect(chooseFood('Butter', [second, first])).toBe(second);
  });

  it('NUT-8 prefers a higher score over fewer words', () => {
    const chosen = chooseFood('Garlic', [
      hit('Garlic sauce'),
      hit('Garlic, raw, peeled cloves'),
    ]);
    expect(descriptionOf(chosen)).toBe('Garlic, raw, peeled cloves');
  });

  it('NUT-5 returns null when every hit is skipped or there are none', () => {
    expect(
      chooseFood('Garlic', [
        hit('Garlic, raw', { kcalPer100g: null }),
        hit('Onions, raw'),
      ]),
    ).toBe(null);
    expect(chooseFood('Garlic', [])).toBe(null);
  });

  it('NUT-8 keeps a hit that scores below zero when it is the only one left', () => {
    const chosen = chooseFood('Garlic', [hit('Garlic sauce')]);
    expect(descriptionOf(chosen)).toBe('Garlic sauce');
  });
});

describe('container words in food choice (NUT-8)', () => {
  it('NUT-8 keeps container words in the strict query', () => {
    expect(strictQuery('Garlic cloves')).toBe('+garlic +cloves raw');
    expect(strictQuery('Chicken Breasts')).toBe('+chicken +breasts raw');
  });

  it('NUT-8 "Garlic cloves" scores "Garlic, raw" (head garlic, not clove)', () => {
    // +3 first segment of name words, +2 raw; `clove` is not in the description.
    expect(scoreHit('Garlic cloves', hit('Garlic, raw'))).toBe(5);
  });

  it('NUT-8 "Garlic cloves" skips a hit without garlic ("Spices, cloves, ground")', () => {
    expect(scoreHit('Garlic cloves', hit('Spices, cloves, ground'))).toBe(null);
  });

  it('NUT-8 a container word still earns the +2 name-word bonus', () => {
    // +3 first segment, +2 `clove`, +2 raw.
    expect(scoreHit('Garlic cloves', hit('Garlic, raw, peeled cloves'))).toBe(7);
  });

  it('NUT-8 "Garlic cloves" → "Garlic, raw", not the spice', () => {
    const chosen = chooseFood('Garlic cloves', [
      hit('Spices, cloves, ground'),
      hit('Garlic, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe('Garlic, raw');
  });

  it('NUT-8 "Chicken breasts" → "Chicken, breast, boneless, skinless, raw" (§16 U11)', () => {
    const chosen = chooseFood('Chicken breasts', [
      hit('Chicken breast tenders, breaded, uncooked'),
      hit('Chicken, breast, boneless, skinless, raw'),
    ]);
    expect(descriptionOf(chosen)).toBe(
      'Chicken, breast, boneless, skinless, raw',
    );
  });

  it('NUT-8 a name of container words only keeps its last word as the head ("Slices")', () => {
    expect(scoreHit('Slices', hit('Garlic, raw'))).toBe(null);
    expect(scoreHit('Slices', hit('Slices, bread'))).not.toBe(null);
  });
});

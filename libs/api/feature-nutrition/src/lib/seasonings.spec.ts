// SPEC §9 NUT-7: seasonings count as 0 kcal without a USDA lookup. Pure
// functions, no I/O.
import {
  SEASONING_DESCRIPTION,
  isSeasoning,
  normaliseSeasoningName,
} from './seasonings';

describe('SEASONING_DESCRIPTION (NUT-7)', () => {
  it('NUT-7 is the text SPEC gives for the matchedDescription', () => {
    expect(SEASONING_DESCRIPTION).toBe('Seasoning, counted as 0 kcal');
  });
});

describe('normaliseSeasoningName (NUT-7)', () => {
  it('NUT-7 lower-cases and removes the leading qualifiers', () => {
    expect(normaliseSeasoningName('Freshly Ground Black Pepper')).toBe(
      'pepper',
    );
    expect(normaliseSeasoningName('Sea Salt')).toBe('salt');
    expect(normaliseSeasoningName('Kosher Salt')).toBe('salt');
    expect(normaliseSeasoningName('Dried Oregano')).toBe('oregano');
    expect(normaliseSeasoningName('Smoked Paprika')).toBe('paprika');
  });

  it('NUT-7 reads `&` as `and`', () => {
    expect(normaliseSeasoningName('salt & pepper')).toBe('salt and pepper');
    expect(normaliseSeasoningName('Salt&Pepper')).toBe('salt and pepper');
  });

  it('NUT-7 removes punctuation other than the apostrophe and collapses spaces', () => {
    expect(normaliseSeasoningName("Za'atar")).toBe("za'atar");
    expect(normaliseSeasoningName('  Bay   Leaves. ')).toBe('bay leaves');
    expect(normaliseSeasoningName('Salt, pepper')).toBe('salt pepper');
  });

  it("NUT-7 reads the typographic apostrophe `’` as `'` (\"Za’atar\")", () => {
    expect(normaliseSeasoningName('Za’atar')).toBe("za'atar");
  });

  it('NUT-7 replaces a hyphen with a space ("red-pepper flakes")', () => {
    expect(normaliseSeasoningName('red-pepper flakes')).toBe(
      'red pepper flakes',
    );
  });

  it('NUT-7 removes qualifiers only at the start of the name', () => {
    expect(normaliseSeasoningName('Pepper Ground')).toBe('pepper ground');
  });

  it('NUT-7 never removes the last word ("Ground Black" → "black")', () => {
    expect(normaliseSeasoningName('Ground Black')).toBe('black');
    expect(normaliseSeasoningName('Sea')).toBe('sea');
  });
});

describe('isSeasoning (NUT-7)', () => {
  it.each([
    'Freshly Ground Black Pepper',
    'Sea Salt',
    'salt & pepper',
    'Ground Cumin',
    'Salt',
    'Black Peppercorns',
    'Cayenne Pepper',
    'Ground Cinnamon',
    'Cinnamon Stick',
    'Bay Leaf',
    "Za'atar",
    'Za’atar',
    'Zaatar',
    'red-pepper flakes',
    'Red Pepper Flakes',
    'Garam Masala',
    'Chinese Five Spice',
    'Dried Thyme',
    'Garlic Powder',
    'Ginger',
    'Cloves',
    'MSG',
  ])('NUT-7 treats "%s" as a seasoning', (name) => {
    expect(isSeasoning(name)).toBe(true);
  });

  it.each([
    'Ground Beef',
    'White Onion',
    'Red Pepper',
    'Garlic',
    'Garlic Cloves',
    'Parsley',
    'Cilantro',
    'Basil',
    'Mint',
    'Butter',
    'Salted Butter',
    'Ground Black',
  ])('NUT-7 does not treat "%s" as a seasoning', (name) => {
    expect(isSeasoning(name)).toBe(false);
  });
});

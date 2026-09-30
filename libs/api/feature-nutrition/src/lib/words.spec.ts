// SPEC §9 NUT-8, NUT-9: the word rules shared by food choice and portion
// choice. Pure functions, no I/O.
import { containsPhrase, headWord, singularise, toWords } from './words';

describe('singularise (NUT-8)', () => {
  it('NUT-8 drops a trailing `es` after `o` ("tomatoes" → "tomato")', () => {
    expect(singularise('tomatoes')).toBe('tomato');
    expect(singularise('potatoes')).toBe('potato');
  });

  it('NUT-8 drops a trailing `es` after `ss`, `x`, `ch` and `sh`', () => {
    expect(singularise('glasses')).toBe('glass');
    expect(singularise('boxes')).toBe('box');
    expect(singularise('peaches')).toBe('peach');
    expect(singularise('radishes')).toBe('radish');
  });

  it('NUT-8 drops only the `s` when `es` follows a single `s` ("cheeses" → "cheese")', () => {
    expect(singularise('cheeses')).toBe('cheese');
    expect(singularise('roses')).toBe('rose');
  });

  it('NUT-8 drops only the `s` when `es` follows another letter ("leaves" → "leave")', () => {
    expect(singularise('leaves')).toBe('leave');
    expect(singularise('olives')).toBe('olive');
  });

  it('NUT-8 drops only the `s` when `es` follows another letter ("cloves" → "clove")', () => {
    expect(singularise('cloves')).toBe('clove');
    expect(singularise('carrots')).toBe('carrot');
    expect(singularise('eggs')).toBe('egg');
    expect(singularise('grapes')).toBe('grape');
  });

  it('NUT-8 keeps a trailing `s` preceded by `s` ("glass" stays)', () => {
    expect(singularise('glass')).toBe('glass');
    expect(singularise('swiss')).toBe('swiss');
  });

  it('NUT-8 leaves a word without a trailing `s` unchanged', () => {
    expect(singularise('garlic')).toBe('garlic');
    expect(singularise('beef')).toBe('beef');
  });

  it('UNSPECIFIED keeps very short words unchanged (length guards)', () => {
    // SPEC NUT-8 states no minimum length; the code only drops `es` from
    // words longer than 3 letters and `s` from words longer than 2.
    expect(singularise('us')).toBe('us');
    expect(singularise('oes')).toBe('oe');
  });
});

describe('toWords (NUT-8)', () => {
  it('NUT-8 lower-cases, splits on anything that is not a letter and singularises', () => {
    expect(toWords('Chicken, breast, boneless, skinless, raw')).toEqual([
      'chicken',
      'breast',
      'boneless',
      'skinless',
      'raw',
    ]);
    expect(toWords('Plum Tomatoes')).toEqual(['plum', 'tomato']);
    expect(toWords('Butter, Clarified butter (ghee)')).toEqual([
      'butter',
      'clarified',
      'butter',
      'ghee',
    ]);
  });

  it('NUT-8 drops digits and empty pieces ("4 Cloves Crushed")', () => {
    expect(toWords('4 Cloves Crushed')).toEqual(['clove', 'crushed']);
    expect(toWords('Water convolvulus,raw')).toEqual([
      'water',
      'convolvulu',
      'raw',
    ]);
  });

  it('NUT-8 keeps accented letters inside a word ("Gruyère", "Jalapeño Peppers")', () => {
    expect(toWords('Gruyère')).toEqual(['gruyère']);
    expect(toWords('Jalapeño Peppers')).toEqual(['jalapeño', 'pepper']);
    expect(toWords('Crème fraîche')).toEqual(['crème', 'fraîche']);
  });

  it('NUT-8 splits on apostrophes and hyphens, which are not letters', () => {
    expect(toWords("Za'atar")).toEqual(['za', 'atar']);
    expect(toWords('all-purpose')).toEqual(['all', 'purpose']);
  });

  it('NUT-9 keeps `g` as its own word, not as a letter inside other words', () => {
    expect(toWords('100 g')).toEqual(['g']);
    expect(toWords('1 large egg')).toEqual(['large', 'egg']);
  });

  it('NUT-8 yields no words for empty or letter-free text', () => {
    expect(toWords('')).toEqual([]);
    expect(toWords('1 1/2')).toEqual([]);
  });
});

describe('containsPhrase (NUT-9)', () => {
  it('NUT-9 finds a phrase as consecutive words', () => {
    expect(
      containsPhrase(
        ['quantity', 'not', 'specified'],
        ['quantity', 'not', 'specified'],
      ),
    ).toBe(true);
    expect(
      containsPhrase(
        ['1', 'quantity', 'not', 'specified', 'x'],
        ['quantity', 'not', 'specified'],
      ),
    ).toBe(true);
  });

  it('NUT-9 does not match the words out of order or apart', () => {
    expect(
      containsPhrase(
        ['quantity', 'specified', 'not'],
        ['quantity', 'not', 'specified'],
      ),
    ).toBe(false);
    expect(
      containsPhrase(
        ['quantity', 'is', 'not', 'specified'],
        ['quantity', 'not', 'specified'],
      ),
    ).toBe(false);
  });

  it('NUT-9 does not match a phrase longer than the words, nor an empty phrase', () => {
    expect(containsPhrase(['quantity'], ['quantity', 'not'])).toBe(false);
    expect(containsPhrase(['clove'], [])).toBe(false);
  });
});

describe('headWord (NUT-8)', () => {
  it('NUT-8 takes the last word that is not a container word ("Garlic cloves" → garlic)', () => {
    expect(headWord(toWords('Garlic cloves'))).toBe('garlic');
    expect(headWord(toWords('Chicken Breasts'))).toBe('chicken');
  });

  it.each([
    'clove',
    'breast',
    'fillet',
    'filet',
    'stalk',
    'sprig',
    'slice',
    'leaf',
    'leave',
    'head',
  ])('NUT-8 never takes the container word `%s` as the head', (container) => {
    expect(headWord(['salmon', container])).toBe('salmon');
  });

  it('NUT-8 compares container words after singularising', () => {
    expect(headWord(toWords('Salmon Fillets'))).toBe('salmon');
    expect(headWord(toWords('Beef Filets'))).toBe('beef');
    expect(headWord(toWords('Celery Stalks'))).toBe('celery');
    expect(headWord(toWords('Thyme Sprigs'))).toBe('thyme');
    expect(headWord(toWords('Bread Slices'))).toBe('bread');
    expect(headWord(toWords('Lettuce Heads'))).toBe('lettuce');
  });

  it('NUT-8 treats `leave` (what "leaves" singularises to) and `leaf` as container words', () => {
    expect(headWord(toWords('Basil leaves'))).toBe('basil');
    expect(headWord(toWords('Bay leaf'))).toBe('bay');
    expect(headWord(toWords('Lettuce leaves'))).toBe('lettuce');
  });

  it('NUT-8 skips several container words at the end ("Chicken breast fillets" → chicken)', () => {
    expect(headWord(toWords('Chicken breast fillets'))).toBe('chicken');
  });

  it('NUT-8 keeps the last word when the name has no container word', () => {
    expect(headWord(toWords('Ground Beef'))).toBe('beef');
    expect(headWord(toWords('Plum Tomatoes'))).toBe('tomato');
  });

  it('NUT-8 a container word before the last word does not change the head', () => {
    expect(headWord(['chicken', 'breast', 'meat'])).toBe('meat');
  });

  it('NUT-8 a name made only of container words keeps its last word ("Slices")', () => {
    expect(headWord(toWords('Slices'))).toBe('slice');
    expect(headWord(toWords('Cloves'))).toBe('clove');
    expect(headWord(['sprig', 'leaf'])).toBe('leaf');
    expect(headWord(toWords('Leaves'))).toBe('leave');
  });

  it('NUT-8 container words stay name words (toWords keeps them)', () => {
    expect(toWords('Garlic cloves')).toEqual(['garlic', 'clove']);
  });
});

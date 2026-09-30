// SPEC.md §11.5 UI-35: the editor keeps its unsaved fields in sessionStorage
// under `cookbook.draft` as { userId, target: recipeId | 'new', fields }; a
// draft is restored only for the same user and target, malformed or foreign
// drafts are ignored, picked files are never part of it, and there is one
// draft per window.
import {
  clearEditorDraft,
  DRAFT_STORAGE_KEY,
  NEW_RECIPE_DRAFT_TARGET,
  readEditorDraft,
  writeEditorDraft,
} from './editor-draft';
import type { EditorDraftFields } from './editor-draft';

const FIELDS: EditorDraftFields = {
  title: 'Shakshuka',
  description: 'Eggs in a spiced tomato sauce.',
  category: 'Breakfast',
  servings: '2',
  prepMinutes: '10',
  cookMinutes: '',
  ingredients: [
    { quantity: 3, unit: 'piece', name: 'eggs' },
    { quantity: null, unit: 'pinch', name: 'salt', note: 'to taste' },
  ],
  steps: [{ text: 'Fry the onion.', durationMinutes: 5 }, { text: 'Add the eggs.' }],
};

/** Stores `value` as the raw JSON of the draft key. */
function store(value: unknown): void {
  sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
}

function stored(): unknown {
  const text = sessionStorage.getItem(DRAFT_STORAGE_KEY);
  return text === null ? null : JSON.parse(text);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('editor-draft (UI-35)', () => {
  it("UI-35 uses SPEC's key cookbook.draft and the target \"new\" on create", () => {
    expect(DRAFT_STORAGE_KEY).toBe('cookbook.draft');
    expect(NEW_RECIPE_DRAFT_TARGET).toBe('new');
  });

  it('UI-35 writes { userId, target, fields } to sessionStorage, not localStorage', () => {
    writeEditorDraft('u1', 'new', FIELDS);

    expect(stored()).toEqual({ userId: 'u1', target: 'new', fields: FIELDS });
    expect(localStorage.length).toBe(0);
  });

  it('UI-35 reads back the fields for the same user and target', () => {
    writeEditorDraft('u1', 'r1', FIELDS);

    expect(readEditorDraft('u1', 'r1')).toEqual(FIELDS);
  });

  it('UI-35 reads nothing when no draft is stored', () => {
    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it("UI-35 ignores another user's draft", () => {
    writeEditorDraft('u2', 'new', FIELDS);

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it("UI-35 ignores another editor's draft: another recipe, or new versus edit", () => {
    writeEditorDraft('u1', 'r1', FIELDS);

    expect(readEditorDraft('u1', 'r2')).toBeNull();
    expect(readEditorDraft('u1', 'new')).toBeNull();

    writeEditorDraft('u1', 'new', FIELDS);

    expect(readEditorDraft('u1', 'r1')).toBeNull();
  });

  it('UI-35 keeps one draft per window: a new write replaces the previous draft', () => {
    writeEditorDraft('u1', 'r1', FIELDS);
    writeEditorDraft('u1', 'new', { ...FIELDS, title: 'Ramen' });

    expect(readEditorDraft('u1', 'r1')).toBeNull();
    expect(readEditorDraft('u1', 'new')?.title).toBe('Ramen');
  });

  it('UI-35 clear removes the draft and leaves other session keys, such as cookbook.route', () => {
    sessionStorage.setItem('cookbook.route', '{"userId":"u1"}');
    writeEditorDraft('u1', 'new', FIELDS);

    clearEditorDraft();

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(readEditorDraft('u1', 'new')).toBeNull();
    expect(sessionStorage.getItem('cookbook.route')).toBe('{"userId":"u1"}');
  });

  it('UI-35 accepts the empty category of a new recipe and a quantity of null ("to taste")', () => {
    const fields: EditorDraftFields = {
      ...FIELDS,
      category: '',
      ingredients: [{ quantity: null, unit: 'none', name: '' }],
      steps: [{ text: '' }],
    };
    writeEditorDraft('u1', 'new', fields);

    expect(readEditorDraft('u1', 'new')).toEqual(fields);
  });

  it('UNSPECIFIED UI-35 rebuilds ingredient and step rows, keeping a note or minutes only when present', () => {
    store({
      userId: 'u1',
      target: 'new',
      fields: {
        ...FIELDS,
        ingredients: [
          { quantity: 3, unit: 'piece', name: 'eggs', extra: 'x' },
          { quantity: 1, unit: 'tsp', name: 'cumin', note: 'ground' },
        ],
        steps: [{ text: 'Stir.', durationMinutes: 2, extra: 1 }, { text: 'Serve.' }],
      },
    });

    const draft = readEditorDraft('u1', 'new');

    expect(draft?.ingredients).toEqual([
      { quantity: 3, unit: 'piece', name: 'eggs' },
      { quantity: 1, unit: 'tsp', name: 'cumin', note: 'ground' },
    ]);
    expect(draft?.ingredients[0]).not.toHaveProperty('note');
    expect(draft?.steps).toEqual([
      { text: 'Stir.', durationMinutes: 2 },
      { text: 'Serve.' },
    ]);
    expect(draft?.steps[1]).not.toHaveProperty('durationMinutes');
  });

  it('UI-35 ignores a draft that is not JSON', () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, '{not json');

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it.each([
    ['null', null],
    ['an array', [{ userId: 'u1', target: 'new', fields: FIELDS }]],
    ['a string', 'draft'],
    ['a draft without fields', { userId: 'u1', target: 'new' }],
    ['a draft whose fields are an array', { userId: 'u1', target: 'new', fields: [] }],
  ])('UI-35 ignores a stored value that is %s', (_label, value) => {
    store(value);

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it.each<[string, Record<string, unknown>]>([
    ['a numeric title', { title: 5 }],
    ['a missing description', { description: undefined }],
    ['an unknown category', { category: 'Soup' }],
    ['a numeric servings', { servings: 2 }],
    ['a null prepMinutes', { prepMinutes: null }],
    ['a numeric cookMinutes', { cookMinutes: 30 }],
    ['ingredients that are not an array', { ingredients: 'eggs' }],
    ['steps that are not an array', { steps: 'Fry.' }],
    ['no ingredient row', { ingredients: [] }],
    ['no step row', { steps: [] }],
    ['an ingredient with an unknown unit', { ingredients: [{ quantity: 1, unit: 'handful', name: 'basil' }] }],
    ['an ingredient with a text quantity', { ingredients: [{ quantity: '1', unit: 'g', name: 'salt' }] }],
    ['an ingredient without a name', { ingredients: [{ quantity: 1, unit: 'g' }] }],
    ['an ingredient with a numeric note', { ingredients: [{ quantity: 1, unit: 'g', name: 'salt', note: 3 }] }],
    ['an ingredient row that is not an object', { ingredients: ['eggs'] }],
    ['a step without text', { steps: [{ durationMinutes: 5 }] }],
    ['a step with fractional minutes', { steps: [{ text: 'Stir.', durationMinutes: 1.5 }] }],
    ['a step with text minutes', { steps: [{ text: 'Stir.', durationMinutes: '5' }] }],
    ['a step row that is null', { steps: [null] }],
  ])('UI-35 ignores a malformed draft with %s', (_label, change) => {
    store({ userId: 'u1', target: 'new', fields: { ...FIELDS, ...change } });

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it('UI-35 drops the whole draft when a single row is malformed', () => {
    store({
      userId: 'u1',
      target: 'new',
      fields: {
        ...FIELDS,
        ingredients: [
          { quantity: 3, unit: 'piece', name: 'eggs' },
          { quantity: 1, unit: 'bushel', name: 'apples' },
        ],
      },
    });

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it('UNSPECIFIED UI-35 reads nothing when sessionStorage throws on read', () => {
    writeEditorDraft('u1', 'new', FIELDS);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });

    expect(readEditorDraft('u1', 'new')).toBeNull();
  });

  it('UNSPECIFIED UI-35 keeps nothing, without throwing, when sessionStorage is full or disabled', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    expect(() => writeEditorDraft('u1', 'new', FIELDS)).not.toThrow();
    vi.restoreAllMocks();
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UNSPECIFIED UI-35 clear does not throw when sessionStorage is disabled', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });

    expect(() => clearEditorDraft()).not.toThrow();
  });
});

// SPEC.md §3.1.1: the editor validates the recipe content before it is sent, and
// a valid create posts the RecipeWriteRequest shape (§11.6) before onSaved runs.
// UI-31 (per-field messages, the §3.1.1 upper limits, empty category, "Qty",
// Move up / Move down, Add hidden at the limits), UI-25 (every picked image is
// attempted after create; the notice), UI-40 (dirty reporting and the photo
// removal confirmations), UI-20 (no removal of a catalogue photo), UI-41, UI-45
// (growing two-row step textareas, the "Note" placeholder), UI-47 (the
// notice counts in words) and UI-35 (the unsaved fields kept in
// sessionStorage `cookbook.draft`).
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { ApiError } from '@rsn/web/data-access-api';
import { RecipeEditorScreen } from './recipe-editor-screen';
import { clearUploadNotice, peekUploadNotice } from './upload-notice';
import {
  DRAFT_STORAGE_KEY,
  readEditorDraft,
  writeEditorDraft,
} from './editor-draft';
import type { EditorDraftFields } from './editor-draft';

const mocks = vi.hoisted(() => ({
  api: {
    getRecipe: vi.fn(),
    createRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
  },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
    useAuth: () => ({
      user: {
        id: 'u1',
        username: 'rotem',
        email: null,
        favouriteCategories: [],
        createdAt: '2026-09-01T08:00:00.000Z',
      },
      status: 'signed-in',
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

const CREATED: RecipeDetailDto = {
  id: 'r1',
  title: 'Shakshuka',
  category: 'Beef',
  servings: 2,
  visibility: 'private',
  relation: 'own',
  ownerUsername: 'rotem',
  source: 'user',
  imageUrl: null,
  rating: null,
  versionNumber: 1,
  updatedAt: '2026-09-28T10:00:00.000Z',
  myCopyId: null,
  updateAvailable: false,
  ingredients: [{ quantity: 3, unit: 'none', name: 'eggs' }],
  steps: [{ text: 'Fry the onion.' }],
  imageUrls: [],
  externalImageUrl: null,
  canCook: true,
  canEdit: true,
  canRate: false,
  hasComments: false,
  hasVotes: false,
  versionCount: 1,
  forkedFrom: null,
  savedFrom: null,
  sharedWithUserIds: [],
  attribution: null,
};

function set(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** UI-31: the message the control points at through `aria-describedby`. */
function messageFor(label: string): string | null {
  const control = screen.getByLabelText(label);
  const id = control.getAttribute('aria-describedby');
  if (id === null) {
    return null;
  }
  return document.getElementById(id)?.textContent ?? null;
}

/** A form that passes every UI-31 check. */
function fillValid(): void {
  set('Title', 'Shakshuka');
  set('Category', 'Beef');
  set('Servings', '2');
  set('Quantity 1', '3');
  set('Ingredient 1', 'eggs');
  set('Step 1', 'Fry the onion.');
}

function create(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
}

function png(name: string): File {
  return new File(['png'], name, { type: 'image/png' });
}

function pick(file: File): void {
  fireEvent.change(screen.getByLabelText('Add image'), {
    target: { files: [file] },
  });
}

/** IMG-6 object paths: `recipes/<recipeId>/<uuid>.<ext>` inside the bucket. */
const OWN_IMAGE = 'https://storage.example.test/bucket/recipes/r1/a1.jpg?sig=1';
const SOURCE_IMAGE =
  'https://storage.example.test/bucket/recipes/r0/b2.jpg?sig=2';

const EXISTING: RecipeDetailDto = {
  ...CREATED,
  versionNumber: 2,
  versionCount: 2,
  ingredients: [
    { quantity: 3, unit: 'none', name: 'eggs' },
    { quantity: 200, unit: 'g', name: 'tomatoes', note: 'chopped' },
  ],
  steps: [{ text: 'Fry the onion.' }, { text: 'Crack the eggs.' }],
};

function openEditor(
  recipe: RecipeDetailDto,
  handlers: { onDirtyChange?: (dirty: boolean) => void } = {},
) {
  mocks.api.getRecipe.mockResolvedValue(recipe);
  return render(
    <RecipeEditorScreen
      recipeId={recipe.id}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onDirtyChange={handlers.onDirtyChange}
    />,
  );
}

describe('RecipeEditorScreen', () => {
  beforeEach(() => {
    // UI-35: the editor keeps a draft in sessionStorage; none may leak between tests.
    sessionStorage.clear();
    mocks.api.getRecipe.mockReset();
    mocks.api.createRecipe.mockReset().mockResolvedValue(CREATED);
    mocks.api.updateRecipe.mockReset();
    mocks.api.uploadImage.mockReset();
    mocks.api.deleteImage.mockReset();
  });

  afterEach(() => {
    // UI-25: the upload-notice map is module state; a failed assertion must not
    // leave a notice behind for the next test.
    clearUploadNotice('r1');
  });

  it('§3.1.1 refuses a recipe with no named ingredient and does not call createRecipe', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    set('Title', 'Shakshuka');
    set('Step 1', 'Fry the onion.');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // UI-31: the message sits under the ingredient's own name field.
    expect(await screen.findByText('Name this ingredient')).toBeTruthy();
    expect(messageFor('Ingredient 1')).toBe('Name this ingredient');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('§3.1.1 posts the RecipeWriteRequest shape and then reports the saved recipe', async () => {
    const onSaved = vi.fn();
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);

    set('Title', 'Shakshuka');
    // UI-31: a new recipe has no default category, so one is chosen.
    set('Category', 'Beef');
    set('Servings', '2');
    set('Quantity 1', '3');
    set('Ingredient 1', 'eggs');
    set('Step 1', 'Fry the onion.');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    expect(mocks.api.createRecipe).toHaveBeenCalledWith({
      title: 'Shakshuka',
      description: undefined,
      category: 'Beef',
      servings: 2,
      ingredients: [
        { quantity: 3, unit: 'none', name: 'eggs', note: undefined },
      ],
      steps: [{ text: 'Fry the onion.', durationMinutes: undefined }],
      prepMinutes: undefined,
      cookMinutes: undefined,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(CREATED));
  });

  it('UI-31 starts the category empty with the placeholder "Choose a category"', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    const category = screen.getByLabelText('Category') as HTMLSelectElement;
    expect(category.value).toBe('');
    expect(category.selectedOptions[0].textContent).toBe('Choose a category');
  });

  it('UI-31 gives quantity inputs the placeholder "Qty"', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(
      screen.getByLabelText('Quantity 1').getAttribute('placeholder'),
    ).toBe('Qty');
  });

  it('UI-31 shows each required-field message under its own field, marks it aria-invalid and focuses the first', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

      create();

      await screen.findByText('Give the recipe a title');
      expect(messageFor('Title')).toBe('Give the recipe a title');
      expect(messageFor('Category')).toBe('Choose a category');
      expect(messageFor('Ingredient 1')).toBe('Name this ingredient');
      expect(messageFor('Step 1')).toBe('Write this step');
      for (const label of ['Title', 'Category', 'Ingredient 1', 'Step 1']) {
        expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe(
          'true',
        );
      }
      // Valid fields carry no mark.
      expect(screen.getByLabelText('Servings').getAttribute('aria-invalid')).toBe(
        null,
      );
      const title = screen.getByLabelText('Title');
      expect(document.activeElement).toBe(title);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(title);
      expect(mocks.api.createRecipe).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown })
        .scrollIntoView;
    }
  });

  it('UI-31 focuses the first invalid field in screen order', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    set('Title', 'Shakshuka');
    set('Ingredient 1', 'eggs');

    create();

    await screen.findByText('Write this step');
    expect(messageFor('Category')).toBe('Choose a category');
    expect(document.activeElement).toBe(screen.getByLabelText('Category'));
  });

  it('UI-31 drops a message and its aria-invalid once the field is edited', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    create();
    await screen.findByText('Give the recipe a title');
    set('Title', 'Shakshuka');

    expect(screen.queryByText('Give the recipe a title')).toBeNull();
    expect(screen.getByLabelText('Title').getAttribute('aria-invalid')).toBe(
      null,
    );
    // The other messages stay until their own field changes.
    expect(messageFor('Ingredient 1')).toBe('Name this ingredient');
  });

  it('UI-31 shows the lower-bound messages for servings, minutes, quantity and step minutes', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Servings', '0');
    set('Prep minutes', '-1');
    set('Cook minutes', '-5');
    set('Quantity 1', '-1');
    set('Step 1 minutes', '0');

    create();

    await screen.findByText('Servings must be at least 1');
    expect(messageFor('Servings')).toBe('Servings must be at least 1');
    expect(messageFor('Prep minutes')).toBe("Prep minutes can't be negative");
    expect(messageFor('Cook minutes')).toBe("Cook minutes can't be negative");
    expect(messageFor('Quantity 1')).toBe("Quantity can't be negative");
    expect(messageFor('Step 1 minutes')).toBe('Minutes must be at least 1');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('UI-31 asks for servings when the field is left empty', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Servings', '');

    create();

    await screen.findByText('Servings must be at least 1');
    expect(messageFor('Servings')).toBe('Servings must be at least 1');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('§3.1.1 UI-31 rejects a quantity of 0 with "Quantity must be more than 0"', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Quantity 1', '0');

    create();

    await screen.findByText('Quantity must be more than 0');
    expect(messageFor('Quantity 1')).toBe('Quantity must be more than 0');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('§3.1.1 accepts an empty quantity as "to taste"', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Quantity 1', '');

    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    expect(mocks.api.createRecipe.mock.calls[0][0].ingredients[0].quantity).toBe(
      null,
    );
  });

  it('UI-31 §3.1.1 shows the upper-limit messages for the numeric fields', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Servings', '7');
    set('Prep minutes', '1441');
    set('Cook minutes', '1441');
    set('Quantity 1', '10001');
    set('Step 1 minutes', '1441');

    create();

    await screen.findByText('Servings can be at most 6');
    expect(messageFor('Servings')).toBe('Servings can be at most 6');
    expect(messageFor('Prep minutes')).toBe('Prep minutes can be at most 1440');
    expect(messageFor('Cook minutes')).toBe('Cook minutes can be at most 1440');
    expect(messageFor('Quantity 1')).toBe('Quantity can be at most 10000');
    expect(messageFor('Step 1 minutes')).toBe('Minutes can be at most 1440');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('UI-31 §3.1.1 accepts the upper limits themselves', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Servings', '6');
    set('Prep minutes', '1440');
    set('Cook minutes', '0');
    set('Quantity 1', '10000');
    set('Step 1 minutes', '1440');

    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    const posted = mocks.api.createRecipe.mock.calls[0][0];
    expect(posted.servings).toBe(6);
    expect(posted.prepMinutes).toBe(1440);
    expect(posted.cookMinutes).toBe(0);
    expect(posted.ingredients[0].quantity).toBe(10000);
    expect(posted.steps[0].durationMinutes).toBe(1440);
  });

  it('UI-31 §3.1.1 shows the upper-limit messages for the text fields', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Title', 't'.repeat(201));
    set('Description', 'd'.repeat(501));
    set('Ingredient 1', 'i'.repeat(121));
    set('Note 1', 'n'.repeat(121));
    set('Step 1', 's'.repeat(1001));

    create();

    await screen.findByText('Title can be at most 200 characters');
    expect(messageFor('Title')).toBe('Title can be at most 200 characters');
    expect(messageFor('Description')).toBe(
      'Description can be at most 500 characters',
    );
    expect(messageFor('Ingredient 1')).toBe(
      'Ingredient names can be at most 120 characters',
    );
    expect(messageFor('Note 1')).toBe('Notes can be at most 120 characters');
    expect(messageFor('Step 1')).toBe('Steps can be at most 1000 characters');
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('§3.1.1 carries the limits as maxLength and max on the editor controls', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    const attr = (label: string, name: string): string | null =>
      screen.getByLabelText(label).getAttribute(name);
    expect(attr('Title', 'maxlength')).toBe('200');
    expect(attr('Description', 'maxlength')).toBe('500');
    expect(attr('Ingredient 1', 'maxlength')).toBe('120');
    expect(attr('Note 1', 'maxlength')).toBe('120');
    expect(attr('Step 1', 'maxlength')).toBe('1000');
    expect(attr('Servings', 'max')).toBe('6');
    expect(attr('Prep minutes', 'max')).toBe('1440');
    expect(attr('Cook minutes', 'max')).toBe('1440');
    expect(attr('Quantity 1', 'max')).toBe('10000');
    expect(attr('Step 1 minutes', 'max')).toBe('1440');
  });

  it('UI-31 Move up and Move down reorder the ingredients and the posted list follows', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: /Add ingredient/ }));
    set('Ingredient 2', 'tomatoes');

    // The ends cannot move past the list.
    expect(
      (
        screen.getByRole('button', {
          name: 'Move ingredient 1 up',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Move ingredient 2 down',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 2 up' }));

    expect((screen.getByLabelText('Ingredient 1') as HTMLInputElement).value).toBe(
      'tomatoes',
    );
    expect((screen.getByLabelText('Ingredient 2') as HTMLInputElement).value).toBe(
      'eggs',
    );
    // The quantity moved with its row.
    expect((screen.getByLabelText('Quantity 2') as HTMLInputElement).value).toBe(
      '3',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Move ingredient 1 down' }),
    );
    expect((screen.getByLabelText('Ingredient 1') as HTMLInputElement).value).toBe(
      'eggs',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move ingredient 1 down' }));
    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    expect(
      mocks.api.createRecipe.mock.calls[0][0].ingredients.map(
        (ingredient: { name: string }) => ingredient.name,
      ),
    ).toEqual(['tomatoes', 'eggs']);
  });

  it('UI-31 Move up and Move down reorder the steps', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: /Add step/ }));
    set('Step 2', 'Crack the eggs.');
    set('Step 2 minutes', '4');

    fireEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));

    expect((screen.getByLabelText('Step 1') as HTMLInputElement).value).toBe(
      'Crack the eggs.',
    );
    expect(
      (screen.getByLabelText('Step 1 minutes') as HTMLInputElement).value,
    ).toBe('4');
    expect(
      (
        screen.getByRole('button', { name: 'Move step 1 up' }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    expect(mocks.api.createRecipe.mock.calls[0][0].steps).toEqual([
      { text: 'Crack the eggs.', durationMinutes: 4 },
      { text: 'Fry the onion.', durationMinutes: undefined },
    ]);
  });

  it('UI-31 §3.1.1 hides Add ingredient once the recipe has 50 ingredients and Add step once it has 60 steps', async () => {
    // Loaded at 49 / 59 so one click reaches each limit (role queries over
    // 50 rows are too slow to click there one row at a time).
    openEditor({
      ...EXISTING,
      ingredients: Array.from({ length: 49 }, (_, index) => ({
        quantity: 1,
        unit: 'none' as const,
        name: `item ${index + 1}`,
      })),
      steps: Array.from({ length: 59 }, (_, index) => ({
        text: `step ${index + 1}`,
      })),
    });
    await screen.findByDisplayValue('item 49');

    fireEvent.click(screen.getByText('Add ingredient'));

    expect(screen.getByLabelText('Ingredient 50')).toBeTruthy();
    expect(screen.queryByText('Add ingredient')).toBeNull();
    expect(screen.getByText('Add step')).toBeTruthy();

    fireEvent.click(screen.getByText('Add step'));

    expect(screen.getByLabelText('Step 60')).toBeTruthy();
    expect(screen.queryByText('Add step')).toBeNull();
  });

  it('UI-31 §3.1.1 refuses a loaded recipe above 50 ingredients or 60 steps until it is cut down', async () => {
    const onSaved = vi.fn();
    mocks.api.getRecipe.mockResolvedValue({
      ...EXISTING,
      ingredients: Array.from({ length: 51 }, (_, index) => ({
        quantity: 1,
        unit: 'none' as const,
        name: `item ${index + 1}`,
      })),
      steps: Array.from({ length: 61 }, (_, index) => ({
        text: `step ${index + 1}`,
      })),
    });
    render(
      <RecipeEditorScreen recipeId="r1" onSaved={onSaved} onCancel={vi.fn()} />,
    );

    await screen.findByDisplayValue('item 51');
    expect(screen.queryByRole('button', { name: /Add ingredient/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add step/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await screen.findByText('A recipe can have at most 50 ingredients');
    expect(messageFor('Ingredient 51')).toBe(
      'A recipe can have at most 50 ingredients',
    );
    expect(messageFor('Step 61')).toBe('A recipe can have at most 60 steps');
    expect(mocks.api.updateRecipe).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('UI-25 UI-47 attempts every picked image after create, opens the recipe and leaves the notice for the detail screen', async () => {
    const onSaved = vi.fn();
    mocks.api.uploadImage
      .mockRejectedValueOnce(new ApiError(400, 'Images must be 5 MB or smaller.'))
      .mockResolvedValueOnce({ imageUrls: [OWN_IMAGE] });
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);
    fillValid();
    pick(png('one.png'));
    pick(png('two.png'));
    await screen.findByRole('button', { name: /two\.png/ });

    create();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.api.uploadImage).toHaveBeenCalledTimes(2);
    expect(mocks.api.uploadImage.mock.calls.map((call) => call[0])).toEqual([
      'r1',
      'r1',
    ]);
    expect(
      mocks.api.uploadImage.mock.calls.map((call) => (call[1] as File).name),
    ).toEqual(['one.png', 'two.png']);
    expect(onSaved).toHaveBeenCalledWith({ ...CREATED, imageUrls: [OWN_IMAGE] });
    expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1);
    expect(peekUploadNotice('r1')).toBe(
      'The recipe was saved, but 1 image could not be uploaded: Images must be 5 MB or smaller.',
    );
    clearUploadNotice('r1');
  });

  it('UI-25 UI-47 opens the new recipe even when every upload fails, quoting the first failure', async () => {
    const onSaved = vi.fn();
    mocks.api.uploadImage
      .mockRejectedValueOnce(new ApiError(503, 'Image storage is unavailable.'))
      .mockRejectedValueOnce(new ApiError(400, 'Second failure.'));
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);
    fillValid();
    pick(png('one.png'));
    pick(png('two.png'));
    await screen.findByRole('button', { name: /two\.png/ });

    create();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(CREATED));
    expect(peekUploadNotice('r1')).toBe(
      'The recipe was saved, but 2 images could not be uploaded: Image storage is unavailable.',
    );
    clearUploadNotice('r1');
  });

  it('UI-25 leaves no notice when every picked image uploads', async () => {
    const onSaved = vi.fn();
    mocks.api.uploadImage.mockResolvedValue({ imageUrls: [OWN_IMAGE] });
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);
    fillValid();
    pick(png('one.png'));
    await screen.findByRole('button', { name: /one\.png/ });

    create();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(peekUploadNotice('r1')).toBeNull();
  });

  it('UI-25 stays in the editor with the message when POST /recipes fails, uploading nothing', async () => {
    const onSaved = vi.fn();
    mocks.api.createRecipe.mockRejectedValue(
      new ApiError(503, "Something went wrong on CookBook's server. Try again."),
    );
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);
    fillValid();
    pick(png('one.png'));
    await screen.findByRole('button', { name: /one\.png/ });

    create();

    expect(
      await screen.findByText(
        "Something went wrong on CookBook's server. Try again.",
      ),
    ).toBeTruthy();
    expect(mocks.api.uploadImage).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('UI-40 reports a new editor dirty once a field changes and clean when it is changed back', () => {
    const onDirtyChange = vi.fn();
    const { unmount } = render(
      <RecipeEditorScreen
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    set('Title', 'Shakshuka');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    set('Title', '');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    set('Ingredient 1', 'eggs');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    // UI-40: leaving the editor clears the flag.
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('UI-40 reports a new editor dirty when an image is picked but not yet uploaded', async () => {
    const onDirtyChange = vi.fn();
    render(
      <RecipeEditorScreen
        onSaved={vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    pick(png('one.png'));

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(mocks.api.uploadImage).not.toHaveBeenCalled();
  });

  it('UI-40 treats the loaded version as clean and an edit of it as dirty', async () => {
    const onDirtyChange = vi.fn();
    openEditor(EXISTING, { onDirtyChange });

    await screen.findByDisplayValue('tomatoes');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);

    set('Note 2', 'diced');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    set('Note 2', 'chopped');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('UI-40 asks "Remove this photo?" before dropping a picked image, and Cancel keeps it', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    pick(png('one.png'));

    fireEvent.click(await screen.findByRole('button', { name: /one\.png/ }));

    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove this photo?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /one\.png/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /one\.png/ }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(screen.queryByRole('button', { name: /one\.png/ })).toBeNull();
    expect(mocks.api.deleteImage).not.toHaveBeenCalled();
  });

  it('UI-40 IMG-7 asks "Remove this photo from your recipe and from every copy of it?" for an image this recipe owns', async () => {
    mocks.api.deleteImage.mockResolvedValue({ imageUrls: [SOURCE_IMAGE] });
    openEditor({ ...EXISTING, imageUrls: [OWN_IMAGE, SOURCE_IMAGE] });

    await screen.findByDisplayValue('tomatoes');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        'Remove this photo from your recipe and from every copy of it?',
      ),
    ).toBeTruthy();
    expect(mocks.api.deleteImage).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(mocks.api.deleteImage).toHaveBeenCalledWith('r1', 0),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1),
    );
  });

  it('UI-40 IMG-7 asks only "Remove this photo?" for an image the recipe links from its source', async () => {
    mocks.api.deleteImage.mockResolvedValue({ imageUrls: [OWN_IMAGE] });
    openEditor({ ...EXISTING, imageUrls: [OWN_IMAGE, SOURCE_IMAGE] });

    await screen.findByDisplayValue('tomatoes');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove this photo?')).toBeTruthy();
    expect(
      within(dialog).queryByText(
        'Remove this photo from your recipe and from every copy of it?',
      ),
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mocks.api.deleteImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    await waitFor(() =>
      expect(mocks.api.deleteImage).toHaveBeenCalledWith('r1', 1),
    );
  });

  it('UI-20 never offers to remove the catalogue photo of a TheMealDB copy', async () => {
    const external = 'https://images.example.test/meals/lasagna.jpg';
    const { container } = openEditor({
      ...EXISTING,
      source: 'themealdb',
      relation: 'saved',
      imageUrls: [],
      externalImageUrl: external,
    });

    await screen.findByDisplayValue('tomatoes');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(container.querySelector(`img[src="${external}"]`)).toBeNull();
  });

  it('UI-45 makes each step a two-row textarea-grow textarea of at most 1000 characters', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    const step = screen.getByLabelText('Step 1');
    expect(step.tagName).toBe('TEXTAREA');
    expect(step.getAttribute('rows')).toBe('2');
    expect(step.getAttribute('maxlength')).toBe('1000');
    expect(step.classList.contains('textarea-grow')).toBe(true);
    expect(step.classList.contains('input')).toBe(true);
    expect(step.getAttribute('placeholder')).toBe('Step 1');
  });

  it('UI-45 grows the step textarea with its text and shrinks it back', () => {
    // jsdom lays nothing out, so the content height is derived from the lines.
    const proto = HTMLTextAreaElement.prototype;
    Object.defineProperty(proto, 'scrollHeight', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return 16 + 20 * this.value.split('\n').length;
      },
    });
    Object.defineProperty(proto, 'offsetHeight', {
      configurable: true,
      get: () => 42,
    });
    Object.defineProperty(proto, 'clientHeight', {
      configurable: true,
      get: () => 40,
    });
    try {
      render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
      const step = screen.getByLabelText('Step 1') as HTMLTextAreaElement;
      // One line: 36 px of content and padding, plus the 2 px border.
      expect(step.style.height).toBe('38px');

      set('Step 1', 'one\ntwo\nthree\nfour\nfive');
      expect(step.style.height).toBe('118px');

      set('Step 1', 'one');
      expect(step.style.height).toBe('38px');
    } finally {
      delete (proto as unknown as Record<string, unknown>)['scrollHeight'];
      delete (proto as unknown as Record<string, unknown>)['offsetHeight'];
      delete (proto as unknown as Record<string, unknown>)['clientHeight'];
    }
  });

  it('UI-45 keeps the line breaks inside a step and trims only the surrounding whitespace when it posts', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);
    fillValid();
    set('Step 1', '  \nFry the onion.\nThen add the garlic.\n  ');

    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    expect(mocks.api.createRecipe.mock.calls[0][0].steps).toEqual([
      { text: 'Fry the onion.\nThen add the garlic.', durationMinutes: undefined },
    ]);
  });

  it('§3.1.1 BUG-033 saves a new version of a recipe whose stored ingredient note is null, sending the note as absent', async () => {
    const onSaved = vi.fn();
    const saved = { ...EXISTING, versionNumber: 3, versionCount: 3 };
    mocks.api.updateRecipe.mockResolvedValue(saved);
    mocks.api.getRecipe.mockResolvedValue({
      ...EXISTING,
      ingredients: [
        // A row stored before the API read null as absent (§3.1.1).
        { quantity: 3, unit: 'none', name: 'eggs', note: null as unknown as string },
        { quantity: 200, unit: 'g', name: 'tomatoes', note: 'chopped' },
      ],
    });
    render(
      <RecipeEditorScreen recipeId="r1" onSaved={onSaved} onCancel={vi.fn()} />,
    );

    await screen.findByDisplayValue('tomatoes');
    expect((screen.getByLabelText('Note 1') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await waitFor(() => expect(mocks.api.updateRecipe).toHaveBeenCalledTimes(1));
    const [id, request] = mocks.api.updateRecipe.mock.calls[0];
    expect(id).toBe('r1');
    expect(request.ingredients).toEqual([
      { quantity: 3, unit: 'none', name: 'eggs', note: undefined },
      { quantity: 200, unit: 'g', name: 'tomatoes', note: 'chopped' },
    ]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UI-45 gives the ingredient note the placeholder "Note"', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText('Note 1').getAttribute('placeholder')).toBe(
      'Note',
    );
  });

  it('UI-41 gives the text the user writes dir="auto"', () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    for (const label of [
      'Title',
      'Description',
      'Ingredient 1',
      'Note 1',
      'Step 1',
    ]) {
      expect(screen.getByLabelText(label).getAttribute('dir')).toBe('auto');
    }
  });
});

describe('RecipeEditorScreen drafts (UI-35)', () => {
  /** A create draft that differs from the empty editor in every field. */
  const NEW_DRAFT: EditorDraftFields = {
    title: 'Ramen',
    description: 'A quick weeknight bowl.',
    category: 'Miscellaneous',
    servings: '4',
    prepMinutes: '15',
    cookMinutes: '25',
    ingredients: [
      { quantity: 200, unit: 'g', name: 'noodles' },
      { quantity: 1, unit: 'l', name: 'stock', note: 'hot' },
    ],
    steps: [{ text: 'Boil the noodles.', durationMinutes: 4 }, { text: 'Serve.' }],
  };

  /** EXISTING as the editor shows it once loaded (UI-40's opening state on edit). */
  const LOADED: EditorDraftFields = {
    title: 'Shakshuka',
    description: '',
    category: 'Beef',
    servings: '2',
    prepMinutes: '',
    cookMinutes: '',
    ingredients: [
      { quantity: 3, unit: 'none', name: 'eggs' },
      { quantity: 200, unit: 'g', name: 'tomatoes', note: 'chopped' },
    ],
    steps: [{ text: 'Fry the onion.' }, { text: 'Crack the eggs.' }],
  };

  function storedDraft(): { userId: string; target: string; fields: EditorDraftFields } | null {
    const text = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return text === null ? null : JSON.parse(text);
  }

  function value(label: string): string {
    return (screen.getByLabelText(label) as HTMLInputElement).value;
  }

  function renderNew(
    handlers: {
      onSaved?: (recipe: RecipeDetailDto) => void;
      onDirtyChange?: (dirty: boolean) => void;
    } = {},
  ) {
    return render(
      <RecipeEditorScreen
        onSaved={handlers.onSaved ?? vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={handlers.onDirtyChange}
      />,
    );
  }

  beforeEach(() => {
    sessionStorage.clear();
    mocks.api.getRecipe.mockReset();
    mocks.api.createRecipe.mockReset().mockResolvedValue(CREATED);
    mocks.api.updateRecipe.mockReset();
    mocks.api.uploadImage.mockReset();
    mocks.api.deleteImage.mockReset();
  });

  afterEach(() => {
    clearUploadNotice('r1');
  });

  it('UI-35 keeps no draft while a new editor holds what it opened with', () => {
    renderNew();

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 writes the fields to cookbook.draft for the user and "new" once they differ', () => {
    renderNew();

    set('Title', 'Shakshuka');

    expect(storedDraft()).toEqual({
      userId: 'u1',
      target: 'new',
      fields: {
        title: 'Shakshuka',
        description: '',
        category: '',
        servings: '2',
        prepMinutes: '',
        cookMinutes: '',
        ingredients: [{ quantity: null, unit: 'none', name: '' }],
        steps: [{ text: '' }],
      },
    });

    set('Ingredient 1', 'eggs');
    set('Step 1', 'Fry the onion.');

    expect(storedDraft()?.fields.ingredients[0]?.name).toBe('eggs');
    expect(storedDraft()?.fields.steps).toEqual([{ text: 'Fry the onion.' }]);
  });

  it('UI-35 clears the draft once the fields are back to what the editor opened with', () => {
    renderNew();
    set('Title', 'Shakshuka');
    expect(storedDraft()).not.toBeNull();

    set('Title', '');

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 keeps the draft when the editor goes away unsaved, and the same user gets it back', () => {
    const first = renderNew();
    set('Title', 'Shakshuka');
    set('Servings', '3');
    first.unmount();

    expect(storedDraft()?.fields.title).toBe('Shakshuka');

    renderNew();

    expect(value('Title')).toBe('Shakshuka');
    expect(value('Servings')).toBe('3');
  });

  it('UI-35 restores every field of a draft kept for this user on a new recipe and reports it dirty', () => {
    writeEditorDraft('u1', 'new', NEW_DRAFT);
    const onDirtyChange = vi.fn();

    renderNew({ onDirtyChange });

    expect(value('Title')).toBe('Ramen');
    expect(value('Description')).toBe('A quick weeknight bowl.');
    expect(value('Category')).toBe('Miscellaneous');
    expect(value('Servings')).toBe('4');
    expect(value('Prep minutes')).toBe('15');
    expect(value('Cook minutes')).toBe('25');
    expect(value('Quantity 1')).toBe('200');
    expect(value('Unit 1')).toBe('g');
    expect(value('Ingredient 1')).toBe('noodles');
    expect(value('Ingredient 2')).toBe('stock');
    expect(value('Note 2')).toBe('hot');
    expect(value('Step 1')).toBe('Boil the noodles.');
    expect(value('Step 1 minutes')).toBe('4');
    expect(value('Step 2')).toBe('Serve.');
    // UI-40: the restored fields differ from the empty editor.
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    // The draft stays until Save or Discard.
    expect(readEditorDraft('u1', 'new')).toEqual(NEW_DRAFT);
  });

  it('UI-35 creates the recipe from the restored draft', async () => {
    writeEditorDraft('u1', 'new', NEW_DRAFT);
    const onSaved = vi.fn();
    renderNew({ onSaved });

    create();

    await waitFor(() => expect(mocks.api.createRecipe).toHaveBeenCalledTimes(1));
    const request = mocks.api.createRecipe.mock.calls[0][0];
    expect(request.title).toBe('Ramen');
    expect(request.category).toBe('Miscellaneous');
    expect(request.servings).toBe(4);
    expect(request.ingredients.map((row: { name: string }) => row.name)).toEqual([
      'noodles',
      'stock',
    ]);
    expect(request.steps[0]).toEqual({ text: 'Boil the noodles.', durationMinutes: 4 });
  });

  it("UI-35 ignores another user's draft, and the editor opening unchanged clears it", () => {
    writeEditorDraft('u2', 'new', NEW_DRAFT);

    renderNew();

    expect(value('Title')).toBe('');
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("UI-35 ignores another editor's draft on a new recipe and clears it (one draft per window)", () => {
    writeEditorDraft('u1', 'r1', { ...LOADED, title: 'Shakshuka deluxe' });

    renderNew();

    expect(value('Title')).toBe('');
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 ignores a malformed draft and clears it', () => {
    sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        userId: 'u1',
        target: 'new',
        fields: { ...NEW_DRAFT, category: 'Soup' },
      }),
    );

    renderNew();

    expect(value('Title')).toBe('');
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 does not keep picked image files', async () => {
    const onDirtyChange = vi.fn();
    renderNew({ onDirtyChange });

    pick(png('one.png'));
    await screen.findByRole('button', { name: /one\.png/ });

    // UI-40 still counts the picked file, but no draft holds it.
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();

    set('Title', 'Shakshuka');

    expect(Object.keys(storedDraft()?.fields ?? {}).sort()).toEqual(
      [
        'category',
        'cookMinutes',
        'description',
        'ingredients',
        'prepMinutes',
        'servings',
        'steps',
        'title',
      ],
    );
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).not.toContain('one.png');
  });

  it('UI-35 Save on create clears the draft after createRecipe and before the image uploads', async () => {
    let draftWhenCreating: string | null = 'unread';
    let draftWhenUploading: string | null = 'unread';
    mocks.api.createRecipe.mockImplementation(async () => {
      draftWhenCreating = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      return CREATED;
    });
    mocks.api.uploadImage.mockImplementation(async () => {
      draftWhenUploading = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      return { imageUrls: [OWN_IMAGE] };
    });
    const onSaved = vi.fn();
    renderNew({ onSaved });
    fillValid();
    pick(png('one.png'));
    await screen.findByRole('button', { name: /one\.png/ });

    create();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(draftWhenCreating).not.toBeNull();
    expect(draftWhenUploading).toBeNull();
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 keeps the draft when POST /recipes fails', async () => {
    mocks.api.createRecipe.mockRejectedValue(
      new ApiError(503, "Something went wrong on CookBook's server. Try again."),
    );
    renderNew();
    fillValid();

    create();

    expect(
      await screen.findByText(
        "Something went wrong on CookBook's server. Try again.",
      ),
    ).toBeTruthy();
    expect(storedDraft()?.fields.title).toBe('Shakshuka');
  });

  it('UI-35 writes nothing on edit until the recipe has loaded', async () => {
    const kept = { ...LOADED, title: 'Shakshuka deluxe' };
    writeEditorDraft('u1', 'r1', kept);
    const before = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    mocks.api.getRecipe.mockReturnValue(new Promise(() => undefined));

    render(
      <RecipeEditorScreen recipeId="r1" onSaved={vi.fn()} onCancel={vi.fn()} />,
    );
    await waitFor(() => expect(mocks.api.getRecipe).toHaveBeenCalled());

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBe(before);
  });

  it('UI-35 lays a draft kept for this recipe over the loaded version and reports it dirty', async () => {
    writeEditorDraft('u1', 'r1', {
      ...LOADED,
      title: 'Shakshuka deluxe',
      ingredients: [
        ...LOADED.ingredients,
        { quantity: 1, unit: 'tsp', name: 'cumin' },
      ],
    });
    const onDirtyChange = vi.fn();

    openEditor(EXISTING, { onDirtyChange });

    expect(await screen.findByDisplayValue('Shakshuka deluxe')).toBeTruthy();
    expect(value('Ingredient 3')).toBe('cumin');
    expect(value('Category')).toBe('Beef');
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(readEditorDraft('u1', 'r1')?.title).toBe('Shakshuka deluxe');
  });

  it('UI-35 UI-40 keeps the loaded version as the opening state under a restored draft', async () => {
    writeEditorDraft('u1', 'r1', { ...LOADED, title: 'Shakshuka deluxe' });
    const onDirtyChange = vi.fn();
    openEditor(EXISTING, { onDirtyChange });
    await screen.findByDisplayValue('Shakshuka deluxe');

    set('Title', 'Shakshuka');

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 an edit that opens unchanged clears a draft kept for another editor', async () => {
    writeEditorDraft('u1', 'new', NEW_DRAFT);

    openEditor(EXISTING);

    await screen.findByDisplayValue('tomatoes');
    expect(value('Title')).toBe('Shakshuka');
    await waitFor(() =>
      expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull(),
    );
  });

  it('UI-35 writes an edit draft under the recipe id', async () => {
    openEditor(EXISTING);
    await screen.findByDisplayValue('tomatoes');

    set('Note 2', 'diced');

    const draft = storedDraft();
    expect(draft?.userId).toBe('u1');
    expect(draft?.target).toBe('r1');
    expect(draft?.fields.ingredients[1]).toEqual({
      quantity: 200,
      unit: 'g',
      name: 'tomatoes',
      note: 'diced',
    });
  });

  it('UI-35 Save on edit clears the draft after updateRecipe', async () => {
    const saved = { ...EXISTING, versionNumber: 3, versionCount: 3 };
    let draftWhenSaving: string | null = 'unread';
    mocks.api.updateRecipe.mockImplementation(async () => {
      draftWhenSaving = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      return saved;
    });
    const onSaved = vi.fn();
    mocks.api.getRecipe.mockResolvedValue(EXISTING);
    render(
      <RecipeEditorScreen recipeId="r1" onSaved={onSaved} onCancel={vi.fn()} />,
    );
    await screen.findByDisplayValue('tomatoes');
    set('Note 2', 'diced');

    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(draftWhenSaving).not.toBeNull();
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('UI-35 keeps the edit draft when the save fails', async () => {
    mocks.api.updateRecipe.mockRejectedValue(
      new ApiError(503, "Something went wrong on CookBook's server. Try again."),
    );
    openEditor(EXISTING);
    await screen.findByDisplayValue('tomatoes');
    set('Note 2', 'diced');

    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    expect(
      await screen.findByText(
        "Something went wrong on CookBook's server. Try again.",
      ),
    ).toBeTruthy();
    expect(storedDraft()?.target).toBe('r1');
    expect(storedDraft()?.fields.ingredients[1]?.note).toBe('diced');
  });
});

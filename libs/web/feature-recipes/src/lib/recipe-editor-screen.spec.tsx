// SPEC.md §3.1.1: the editor validates the recipe content before it is sent, and
// a valid create posts the RecipeWriteRequest shape (§11.6) before onSaved runs.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { RecipeEditorScreen } from './recipe-editor-screen';

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
  ingredients: [{ quantity: 3, unit: 'none', name: 'eggs' }],
  steps: [{ text: 'Fry the onion.' }],
  imageUrls: [],
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

describe('RecipeEditorScreen', () => {
  beforeEach(() => {
    mocks.api.getRecipe.mockReset();
    mocks.api.createRecipe.mockReset().mockResolvedValue(CREATED);
    mocks.api.updateRecipe.mockReset();
    mocks.api.uploadImage.mockReset();
    mocks.api.deleteImage.mockReset();
  });

  it('§3.1.1 refuses a recipe with no named ingredient and does not call createRecipe', async () => {
    render(<RecipeEditorScreen onSaved={vi.fn()} onCancel={vi.fn()} />);

    set('Title', 'Shakshuka');
    set('Step 1', 'Fry the onion.');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText('ingredient 1: name is required'),
    ).toBeTruthy();
    expect(mocks.api.createRecipe).not.toHaveBeenCalled();
  });

  it('§3.1.1 posts the RecipeWriteRequest shape and then reports the saved recipe', async () => {
    const onSaved = vi.fn();
    render(<RecipeEditorScreen onSaved={onSaved} onCancel={vi.fn()} />);

    set('Title', 'Shakshuka');
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
});

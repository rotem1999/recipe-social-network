// SPEC.md SAVE-2 (who may cook, and Save first from Discover), UI-14 (the
// servings stepper rescales on screen only), RATE-1 (whole-star input on public
// recipes), COM-1 (no comment section without one) and UI-12 (the owner row).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  NutritionResponse,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { RecipeDetailScreen } from './recipe-detail-screen';

const mocks = vi.hoisted(() => ({
  api: {
    getRecipe: vi.fn(),
    getNutrition: vi.fn(),
    saveRecipe: vi.fn(),
    rate: vi.fn(),
    listComments: vi.fn(),
    setVisibility: vi.fn(),
    deleteRecipe: vi.fn(),
    listVersions: vi.fn(),
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

const NUTRITION: NutritionResponse = {
  mode: 'ingredients',
  servings: 2,
  kcalPerPortion: 410,
  kcalTotal: 820,
  partial: false,
  ingredients: [
    {
      name: 'flour',
      grams: 200,
      kcal: 728,
      matchedDescription: 'Wheat flour, white, all-purpose',
    },
  ],
  matchedDescription: null,
  source: 'USDA FoodData Central',
};

const OWN: RecipeDetailDto = {
  id: 'r1',
  title: 'Shakshuka',
  category: 'Breakfast',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 30,
  visibility: 'private',
  relation: 'own',
  ownerUsername: 'rotem',
  source: 'user',
  imageUrl: null,
  rating: null,
  versionNumber: 1,
  updatedAt: '2026-09-20T18:00:00.000Z',
  description: 'Eggs poached in tomato.',
  ingredients: [{ quantity: 200, unit: 'g', name: 'flour' }],
  steps: [{ text: 'Fry the onion.', durationMinutes: 5 }],
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

/** SAVE-2: a public recipe the viewer has not saved — cook mode is closed to it. */
const PUBLIC_UNSAVED: RecipeDetailDto = {
  ...OWN,
  id: 'r9',
  title: 'Lentil soup',
  ownerUsername: 'noa',
  visibility: 'public',
  relation: 'public',
  canCook: false,
  canEdit: false,
  canRate: true,
  hasComments: true,
  hasVotes: true,
  rating: { average: 4.5, count: 2, mine: null },
};

function show(recipe: RecipeDetailDto) {
  mocks.api.getRecipe.mockResolvedValue(recipe);
  return render(
    <RecipeDetailScreen
      recipeId={recipe.id}
      backLabel="Home"
      onBack={vi.fn()}
      onCook={vi.fn()}
      onEdit={vi.fn()}
      onDeleted={vi.fn()}
      onOpenRecipe={vi.fn()}
    />,
  );
}

describe('RecipeDetailScreen', () => {
  beforeEach(() => {
    mocks.api.getRecipe.mockReset().mockResolvedValue(OWN);
    mocks.api.getNutrition.mockReset().mockResolvedValue(NUTRITION);
    mocks.api.saveRecipe.mockReset();
    mocks.api.rate.mockReset();
    mocks.api.listComments
      .mockReset()
      .mockResolvedValue({ comments: [], votesEnabled: true });
    mocks.api.setVisibility.mockReset();
    mocks.api.deleteRecipe.mockReset();
    mocks.api.listVersions.mockReset().mockResolvedValue({ versions: [] });
  });

  it('SAVE-2 offers Start cooking when the recipe carries canCook', async () => {
    show(OWN);

    expect(await screen.findByRole('button', { name: /Start cooking/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save to cook/ })).toBeNull();
  });

  it('SAVE-2 offers Save to cook on a public recipe the viewer has not saved', async () => {
    show(PUBLIC_UNSAVED);

    expect(await screen.findByRole('button', { name: /Save to cook/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start cooking/ })).toBeNull();
  });

  it('SAVE-2 saves the public recipe and then offers Start cooking', async () => {
    mocks.api.saveRecipe.mockResolvedValue({
      ...PUBLIC_UNSAVED,
      id: 'copy-1',
      relation: 'saved',
      canCook: true,
    });
    show(PUBLIC_UNSAVED);

    fireEvent.click(await screen.findByRole('button', { name: /Save to cook/ }));

    await waitFor(() => expect(mocks.api.saveRecipe).toHaveBeenCalledWith('r9'));
    expect(await screen.findByRole('button', { name: /Start cooking/ })).toBeTruthy();
  });

  it('UI-14 rescales a quantity on screen when the servings stepper is used', async () => {
    show(OWN);

    expect(await screen.findByText('200 g')).toBeTruthy();
    expect(screen.getByText('2 servings')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(await screen.findByText('300 g')).toBeTruthy();
    expect(screen.getByText('3 servings')).toBeTruthy();
    // UI-14: the rescale is display only — nothing is written back.
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
  });

  it('RATE-1 shows the whole-star input only when the recipe is rateable', async () => {
    const { unmount } = show(PUBLIC_UNSAVED);

    const stars = await screen.findByRole('radiogroup', { name: 'Your rating' });
    expect(stars).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeTruthy();
    unmount();

    show(OWN);
    await screen.findByText('Shakshuka');
    expect(screen.queryByRole('radiogroup', { name: 'Your rating' })).toBeNull();
  });

  it('COM-1 renders no comment section when hasComments is false', async () => {
    show(OWN);

    await screen.findByText('Shakshuka');
    expect(screen.queryByRole('region', { name: 'Comments' })).toBeNull();
    expect(mocks.api.listComments).not.toHaveBeenCalled();
  });

  it('COM-1 renders the comment section when hasComments is true', async () => {
    show(PUBLIC_UNSAVED);

    await waitFor(() =>
      expect(mocks.api.listComments).toHaveBeenCalledWith('r9'),
    );
  });

  it('UI-12 shows the owner row only when the viewer may edit', async () => {
    const { unmount } = show(OWN);

    expect(await screen.findByText('Owner')).toBeTruthy();
    unmount();

    show(PUBLIC_UNSAVED);
    await screen.findByText('Lentil soup');
    expect(screen.queryByText('Owner')).toBeNull();
  });
});

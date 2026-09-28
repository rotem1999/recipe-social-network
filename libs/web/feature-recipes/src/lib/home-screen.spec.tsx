// SPEC.md SAVE-3 (the home tab lists the caller's recipes) and UI-10 (the
// greeting uses the username). `@rsn/web/data-access-api` is mocked at the
// module boundary; `useRequest` stays the real hook.
import { render, screen, waitFor } from '@testing-library/react';
import type { RecipeCardDto, UserDto } from '@rsn/shared/util-contracts';
import { HomeScreen } from './home-screen';

const mocks = vi.hoisted(() => ({
  api: { listRecipes: vi.fn() },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
    useAuth: () => ({
      user: USER,
      status: 'signed-in',
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

const USER: UserDto = {
  id: 'u1',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-01T08:00:00.000Z',
};

const OWN: RecipeCardDto = {
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
};

const SAVED: RecipeCardDto = {
  ...OWN,
  id: 'r2',
  title: 'Lentil soup',
  category: 'Vegan',
  relation: 'saved',
  visibility: 'public',
  ownerUsername: 'noa',
};

describe('HomeScreen', () => {
  beforeEach(() => {
    mocks.api.listRecipes.mockReset().mockResolvedValue({ recipes: [] });
  });

  it('SAVE-3 renders one card per recipe from listRecipes', async () => {
    mocks.api.listRecipes.mockResolvedValue({ recipes: [OWN, SAVED] });
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    // The card is one labelled control per recipe (its washed placeholder
    // repeats the title in the glyph's <title>, so the role query is the exact one).
    expect(await screen.findByRole('button', { name: 'Shakshuka' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lentil soup' })).toBeTruthy();
    expect(screen.getByText('2 recipes')).toBeTruthy();
    expect(mocks.api.listRecipes).toHaveBeenCalledTimes(1);
  });

  it('UI-10 greets the signed-in user by username', async () => {
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    const greeting = await screen.findByRole('heading', { level: 1 });
    expect(greeting.textContent).toMatch(
      /^Good (morning|afternoon|evening), rotem$/,
    );
  });

  it('SAVE-3 shows the empty state when the caller has no recipes', async () => {
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    expect(
      await screen.findByText(
        'No recipes yet. Create one, or save a public recipe from Discover.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByText('0 recipes')).toBeTruthy());
  });
});

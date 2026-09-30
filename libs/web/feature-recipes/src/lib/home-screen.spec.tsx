// SPEC.md SAVE-3 (the home tab lists the caller's recipes) and UI-10 (the
// greeting uses the username), UI-26 (a count or an empty state only after the
// list succeeded; the error and Try again after a failure) and UI-38 (no
// greeting sub-line before the weather line; what the recommendation slot is
// told about the caller's recipes). `@rsn/web/data-access-api` is mocked at the
// module boundary; `useRequest` stays the real hook.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RecipeCardDto, UserDto } from '@rsn/shared/util-contracts';
import { ApiError } from '@rsn/web/data-access-api';
import { HomeScreen } from './home-screen';
import type { HomeRecommendationContext } from './home-screen';

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
  myCopyId: null,
  updateAvailable: false,
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

  it('UI-26 shows neither a count nor the empty state while the list is loading', () => {
    mocks.api.listRecipes.mockReturnValue(new Promise(() => undefined));
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText(/\d+ recipes?$/)).toBeNull();
    expect(
      screen.queryByText(
        'No recipes yet. Create one, or save a public recipe from Discover.',
      ),
    ).toBeNull();
  });

  it('UI-26 shows the error and Try again after a failure, with no count or empty state', async () => {
    mocks.api.listRecipes.mockRejectedValue(
      new ApiError(0, "Can't reach CookBook's server."),
    );
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    expect(
      await screen.findByText("Can't reach CookBook's server."),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('0 recipes')).toBeNull();
    expect(
      screen.queryByText(
        'No recipes yet. Create one, or save a public recipe from Discover.',
      ),
    ).toBeNull();
  });

  it('UI-26 Try again repeats the request and shows the list once it succeeds', async () => {
    mocks.api.listRecipes
      .mockRejectedValueOnce(new ApiError(0, "Can't reach CookBook's server."))
      .mockResolvedValueOnce({ recipes: [OWN] });
    render(<HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('button', { name: 'Shakshuka' }),
    ).toBeTruthy();
    expect(mocks.api.listRecipes).toHaveBeenCalledTimes(2);
    expect(screen.getByText('1 recipe')).toBeTruthy();
    expect(screen.queryByText("Can't reach CookBook's server.")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('UI-38 shows no greeting sub-line until the weather line arrives', async () => {
    const { rerender } = render(
      <HomeScreen onOpenRecipe={vi.fn()} onCook={vi.fn()} greetingLine={null} />,
    );

    const greeting = await screen.findByRole('heading', { level: 1 });
    expect(greeting.nextElementSibling?.tagName).not.toBe('P');

    rerender(
      <HomeScreen
        onOpenRecipe={vi.fn()}
        onCook={vi.fn()}
        greetingLine="18 °C and clear tonight in Jerusalem"
      />,
    );

    const line = screen.getByText('18 °C and clear tonight in Jerusalem');
    expect(greeting.nextElementSibling).toBe(line);
  });

  it('UI-38 tells the recommendation slot hasCandidates null until the list succeeded, then true with an own or saved recipe', async () => {
    mocks.api.listRecipes.mockResolvedValue({ recipes: [SAVED] });
    const seen: Array<boolean | null> = [];
    render(
      <HomeScreen
        onOpenRecipe={vi.fn()}
        onCook={vi.fn()}
        recommendationSlot={(context: HomeRecommendationContext) => {
          seen.push(context.hasCandidates);
          return null;
        }}
      />,
    );

    await screen.findByRole('button', { name: 'Lentil soup' });
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('UI-38 WX-10 tells the slot hasCandidates false when Home holds only recipes shared with the caller', async () => {
    mocks.api.listRecipes.mockResolvedValue({
      recipes: [{ ...OWN, id: 'r7', title: 'Sabich', relation: 'shared' }],
    });
    const seen: Array<boolean | null> = [];
    render(
      <HomeScreen
        onOpenRecipe={vi.fn()}
        onCook={vi.fn()}
        recommendationSlot={(context: HomeRecommendationContext) => {
          seen.push(context.hasCandidates);
          return null;
        }}
      />,
    );

    await screen.findByRole('button', { name: 'Sabich' });
    expect(seen[seen.length - 1]).toBe(false);
  });

  it('UI-38 keeps hasCandidates null after the list failed', async () => {
    mocks.api.listRecipes.mockRejectedValue(
      new ApiError(503, "Something went wrong on CookBook's server. Try again."),
    );
    const seen: Array<boolean | null> = [];
    render(
      <HomeScreen
        onOpenRecipe={vi.fn()}
        onCook={vi.fn()}
        recommendationSlot={(context: HomeRecommendationContext) => {
          seen.push(context.hasCandidates);
          return null;
        }}
      />,
    );

    await screen.findByRole('button', { name: 'Try again' });
    expect(seen.every((value) => value === null)).toBe(true);
  });
});

// SPEC.md DISC-6 (up to 3 pinned favourites, pinned first), DISC-9 (the chip is
// the category filter), SAVE-2 (a public recipe must be saved before it can be
// cooked), DISC-10 / UI-14 (an item the caller has a copy of shows "In your
// recipes" and Cook on that copy), SAVE-10 (the Update available tag) and §3.3 (the attribution footer, UI-7). No provider URL or key lives
// in renderer code (§11.3), so the attribution fixture carries the API's field
// only — the API returns the full string with its URL and the screen renders it
// verbatim.
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  CatalogueItemDto,
  DiscoverResponse,
  RecipeCardDto,
  RecipeDetailDto,
  UserDto,
} from '@rsn/shared/util-contracts';
import type { Category } from '@rsn/shared/util-domain';
import { DiscoverScreen } from './discover-screen';

const mocks = vi.hoisted(() => ({
  api: {
    discover: vi.fn(),
    saveRecipe: vi.fn(),
    setFavouriteCategories: vi.fn(),
    cataloguePreview: vi.fn(),
  },
  favourites: [] as Category[],
  refreshUser: vi.fn(),
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
    useAuth: () => ({
      user: user(),
      status: 'signed-in',
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      refreshUser: mocks.refreshUser,
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

/** The signed-in user; its favourites change per test, its identity does not. */
const USER: UserDto = {
  id: 'u1',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-01T08:00:00.000Z',
};

function user(): UserDto {
  USER.favouriteCategories = mocks.favourites;
  return USER;
}

const PUBLIC_RECIPE: RecipeCardDto = {
  id: 'r9',
  title: 'Lentil soup',
  category: 'Vegan',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 30,
  visibility: 'public',
  relation: 'public',
  ownerUsername: 'noa',
  source: 'user',
  imageUrl: null,
  rating: { average: 4.5, count: 2, mine: null },
  versionNumber: 1,
  updatedAt: '2026-09-20T18:00:00.000Z',
  myCopyId: null,
  updateAvailable: false,
};

const SAVED_COPY: RecipeDetailDto = {
  ...PUBLIC_RECIPE,
  id: 'copy-1',
  relation: 'saved',
  ownerUsername: 'rotem',
  ingredients: [{ quantity: 200, unit: 'g', name: 'lentils' }],
  steps: [{ text: 'Simmer.' }],
  imageUrls: [],
  canCook: true,
  canEdit: true,
  canRate: true,
  hasComments: true,
  hasVotes: true,
  versionCount: 1,
  forkedFrom: null,
  savedFrom: {
    recipeId: 'r9',
    title: 'Lentil soup',
    ownerUsername: 'noa',
    source: 'user',
  },
  sharedWithUserIds: [],
  attribution: null,
};

/** §3.3: the API's `attribution` field, as the screen receives it. */
const ATTRIBUTION = 'Recipe data and imagery: TheMealDB';

const SPLIT: DiscoverResponse = {
  categories: [
    {
      category: 'Vegan',
      isFavourite: false,
      recipes: [PUBLIC_RECIPE],
      catalogue: [],
      page: 1,
      hasMore: false,
    },
  ],
  attribution: ATTRIBUTION,
};

const PASTA: DiscoverResponse = {
  categories: [
    {
      category: 'Pasta',
      isFavourite: false,
      recipes: [],
      catalogue: [],
      page: 1,
      hasMore: false,
    },
  ],
  attribution: ATTRIBUTION,
};

function show(
  handlers: {
    onOpenCatalogue?: (mealId: string) => void;
    onCook?: (id: string) => void;
  } = {},
) {
  return render(
    <DiscoverScreen
      onOpenRecipe={vi.fn()}
      onOpenCatalogue={handlers.onOpenCatalogue ?? vi.fn()}
      onCook={handlers.onCook ?? vi.fn()}
    />,
  );
}

/** GET /discover with one Vegan section holding the given items (DISC-1, DISC-4). */
function veganSplit(
  recipes: RecipeCardDto[],
  catalogue: CatalogueItemDto[] = [],
): DiscoverResponse {
  return {
    categories: [
      {
        category: 'Vegan',
        isFavourite: false,
        recipes,
        catalogue,
        page: 1,
        hasMore: false,
      },
    ],
    attribution: ATTRIBUTION,
  };
}

/** DISC-10: someone else's public recipe the caller already has a live copy of. */
const PUBLIC_WITH_COPY: RecipeCardDto = {
  ...PUBLIC_RECIPE,
  myCopyId: 'copy-1',
};

/** DISC-4 / CAT-7: a TheMealDB tile the caller has already saved. */
const MEAL_WITH_COPY: CatalogueItemDto = {
  mealId: '52944',
  name: 'Vegan Lasagna',
  thumbnailUrl: '/fixtures/vegan-lasagna.jpg',
  category: 'Vegan',
  myCopyId: 'copy-7',
};

function chips(): HTMLElement {
  return screen.getByRole('group', { name: 'Categories' });
}

describe('DiscoverScreen', () => {
  beforeEach(() => {
    mocks.favourites = [];
    mocks.refreshUser.mockReset().mockResolvedValue(USER);
    mocks.api.discover
      .mockReset()
      .mockImplementation((category?: string) =>
        Promise.resolve(category === undefined ? SPLIT : PASTA),
      );
    mocks.api.saveRecipe.mockReset().mockResolvedValue(SAVED_COPY);
    mocks.api.setFavouriteCategories.mockReset().mockResolvedValue(USER);
    mocks.api.cataloguePreview.mockReset();
  });

  it('DISC-6 pins the favourite categories first in the chip row', async () => {
    mocks.favourites = ['Dessert'];
    show();

    const buttons = within(chips()).getAllByRole('button');
    expect(buttons[0].getAttribute('aria-label')).toBe(
      'Unpin Dessert from favourites',
    );
    expect(buttons[1].textContent).toBe('Dessert');
    // Beef leads the unpinned remainder of the DISC-7 order.
    expect(buttons[3].textContent).toBe('Beef');
    await waitFor(() => expect(mocks.api.discover).toHaveBeenCalled());
  });

  it('DISC-6 refuses a fourth favourite inline and sends no request', async () => {
    mocks.favourites = ['Dessert', 'Pasta', 'Vegan'];
    show();

    fireEvent.click(
      within(chips()).getByRole('button', { name: 'Pin Beef as a favourite' }),
    );

    expect(
      await screen.findByText('You can pin up to 3 favourite categories.'),
    ).toBeTruthy();
    expect(mocks.api.setFavouriteCategories).not.toHaveBeenCalled();
  });

  it('DISC-9 asks the API for the chosen category when a chip is selected', async () => {
    show();
    await waitFor(() =>
      expect(mocks.api.discover).toHaveBeenCalledWith(undefined),
    );

    fireEvent.click(within(chips()).getByRole('button', { name: 'Pasta' }));

    await waitFor(() =>
      expect(mocks.api.discover).toHaveBeenCalledWith('Pasta'),
    );
    expect(await screen.findByText('Nothing in Pasta yet.')).toBeTruthy();
  });

  it('SAVE-2 saves a public recipe and then offers Cook on the saved copy', async () => {
    show();

    fireEvent.click(await screen.findByRole('button', { name: /Save/ }));

    await waitFor(() =>
      expect(mocks.api.saveRecipe).toHaveBeenCalledWith('r9'),
    );
    expect(await screen.findByRole('button', { name: /Cook/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });

  it('UI-14 shows the In your recipes tag beside Cook once the save succeeded', async () => {
    show();

    fireEvent.click(await screen.findByRole('button', { name: /Save/ }));

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Cook$/ })).toBeTruthy();
  });

  it("DISC-10 shows In your recipes and Cook on a card that carries myCopyId, and Cook opens the caller's copy", async () => {
    const onCook = vi.fn();
    mocks.api.discover.mockResolvedValue(veganSplit([PUBLIC_WITH_COPY]));
    show({ onCook });

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Cook$/ }));

    expect(onCook).toHaveBeenCalledTimes(1);
    expect(onCook).toHaveBeenCalledWith('copy-1');
    expect(mocks.api.saveRecipe).not.toHaveBeenCalled();
  });

  it('SAVE-10 shows one Update available tag beside In your recipes when the copy is behind', async () => {
    mocks.api.discover.mockResolvedValue(
      veganSplit([{ ...PUBLIC_WITH_COPY, updateAvailable: true }]),
    );
    show();

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.getAllByText('Update available')).toHaveLength(1);
  });

  it('SAVE-10 shows no Update available tag when the copy is up to date', async () => {
    mocks.api.discover.mockResolvedValue(veganSplit([PUBLIC_WITH_COPY]));
    show();

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.queryByText('Update available')).toBeNull();
  });

  it('DISC-10 a TheMealDB tile with myCopyId shows In your recipes and cooks the copy without opening the preview', async () => {
    const onCook = vi.fn();
    const onOpenCatalogue = vi.fn();
    mocks.api.discover.mockResolvedValue(veganSplit([], [MEAL_WITH_COPY]));
    show({ onCook, onOpenCatalogue });

    const tile = await screen.findByRole('button', { name: 'Vegan Lasagna' });
    expect(within(tile).getByText('In your recipes')).toBeTruthy();

    fireEvent.click(within(tile).getByRole('button', { name: /^Cook$/ }));

    expect(onCook).toHaveBeenCalledWith('copy-7');
    expect(onOpenCatalogue).not.toHaveBeenCalled();
    expect(mocks.api.cataloguePreview).not.toHaveBeenCalled();
  });

  it('§3.3 renders the attribution footer the API returned', async () => {
    show();

    expect(await screen.findByText(ATTRIBUTION)).toBeTruthy();
  });
});

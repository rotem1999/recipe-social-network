// SPEC.md DISC-6 (up to 3 pinned favourites, pinned first), DISC-9 (the chip is
// the category filter), SAVE-2 (a public recipe must be saved before it can be
// cooked), DISC-10 / UI-14 (an item the caller has a copy of shows "In your
// recipes" and Cook on that copy), SAVE-10 (the Update available tag) and §3.3 (the attribution footer, UI-7). No provider URL or key lives
// in renderer code (§11.3), so the attribution fixture carries the API's field
// only — the API returns the full string with its URL and the screen renders it
// verbatim.
import {
  act,
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
    saveCatalogue: vi.fn(),
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
  externalImageUrl: null,
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
    mocks.api.saveCatalogue.mockReset().mockResolvedValue(CATALOGUE_COPY);
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

    // UI-36: the tile is an article; its title button holds only the name.
    const title = await screen.findByRole('button', { name: 'Vegan Lasagna' });
    const tile = title.closest('article');
    if (tile === null) {
      throw new Error('the TheMealDB tile is not an article');
    }
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

  it('UI-21 keeps a TheMealDB tile Save loading until the save returns, then shows In your recipes and Cook on Discover', async () => {
    const onCook = vi.fn();
    const onOpenCatalogue = vi.fn();
    const pending = deferred<RecipeDetailDto>();
    mocks.api.saveCatalogue.mockReturnValue(pending.promise);
    mocks.api.discover.mockResolvedValue(veganSplit([], [MEAL]));
    show({ onCook, onOpenCatalogue });

    const tile = await tileOf('Vegan Lasagna');
    fireEvent.click(within(tile).getByRole('button', { name: 'Save' }));

    expect(mocks.api.saveCatalogue).toHaveBeenCalledWith('52944');
    // Not optimistic: still a busy Save, no "In your recipes" yet.
    const busy = within(tile).getByRole('button', { name: 'Save' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(within(tile).queryByText('In your recipes')).toBeNull();

    await act(async () => {
      pending.resolve(CATALOGUE_COPY);
    });

    expect(within(tile).getByText('In your recipes')).toBeTruthy();
    expect(within(tile).queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(within(tile).getByRole('button', { name: /^Cook$/ }));
    expect(onCook).toHaveBeenCalledWith('copy-8');
    // It stays on Discover: the preview never opens.
    expect(onOpenCatalogue).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Discover' })).toBeTruthy();
  });

  it('UI-21 returns a failed TheMealDB tile Save to Save with an inline message', async () => {
    mocks.api.saveCatalogue.mockRejectedValue(new Error('Could not reach the catalogue'));
    mocks.api.discover.mockResolvedValue(veganSplit([], [MEAL]));
    show();

    const tile = await tileOf('Vegan Lasagna');
    fireEvent.click(within(tile).getByRole('button', { name: 'Save' }));

    expect(
      await within(tile).findByText('Could not reach the catalogue'),
    ).toBeTruthy();
    const save = within(tile).getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(within(tile).queryByText('In your recipes')).toBeNull();
  });

  it('UI-26 shows no empty state while GET /discover is pending', () => {
    mocks.api.discover.mockReturnValue(new Promise<DiscoverResponse>(() => undefined));
    show();

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Nothing has been published yet.')).toBeNull();
  });

  it('UI-26 shows the error and Try again instead of the empty state when GET /discover fails, and Try again reloads', async () => {
    mocks.api.discover
      .mockRejectedValueOnce(new Error(SERVER_DOWN))
      .mockResolvedValue(SPLIT);
    show();

    expect(await screen.findByText(SERVER_DOWN)).toBeTruthy();
    expect(screen.queryByText('Nothing has been published yet.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Lentil soup' })).toBeTruthy();
    expect(mocks.api.discover).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(SERVER_DOWN)).toBeNull();
  });

  it('UI-26 shows the empty state only after GET /discover succeeded with nothing', async () => {
    mocks.api.discover.mockResolvedValue({
      categories: [],
      attribution: ATTRIBUTION,
    });
    show();

    expect(
      await screen.findByText('Nothing has been published yet.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('UI-33 re-orders the loaded sections when a favourite is pinned, without reloading the feed', async () => {
    mocks.api.discover.mockResolvedValue(BEEF_THEN_VEGAN);
    mocks.api.setFavouriteCategories.mockResolvedValue({
      ...USER,
      favouriteCategories: ['Vegan'],
    });
    show();
    await screen.findByRole('button', { name: 'Lentil soup' });
    expect(sectionOrder()).toEqual(['Beef', 'Vegan']);

    fireEvent.click(
      within(chips()).getByRole('button', { name: 'Pin Vegan as a favourite' }),
    );

    await waitFor(() => expect(sectionOrder()).toEqual(['Vegan', 'Beef']));
    expect(mocks.api.setFavouriteCategories).toHaveBeenCalledWith({
      categories: ['Vegan'],
    });
    expect(mocks.api.discover).toHaveBeenCalledTimes(1);
    // The grid never blanked: both sections' items are still on screen.
    expect(screen.getByRole('button', { name: 'Lentil soup' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Beef Wellington' })).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    const vegan = screen.getAllByRole('heading', { level: 3 })[0];
    expect(within(vegan).getByText('Favourite')).toBeTruthy();
  });

  it('UI-38 says No community recipes in this category yet above the TheMealDB tiles of a category without public recipes', async () => {
    mocks.api.discover.mockResolvedValue(veganSplit([], [MEAL]));
    show();

    const note = await screen.findByText(
      'No community recipes in this category yet',
    );
    const tile = await tileOf('Vegan Lasagna');
    expect(
      note.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UI-38 omits the no-community note when the category has public recipes', async () => {
    mocks.api.discover.mockResolvedValue(veganSplit([PUBLIC_RECIPE], [MEAL]));
    show();

    await screen.findByRole('button', { name: 'Lentil soup' });
    expect(
      screen.queryByText('No community recipes in this category yet'),
    ).toBeNull();
  });

  it('UI-38 says No community recipes in this category yet in the one-category view too', async () => {
    mocks.api.discover.mockImplementation((category?: string) =>
      Promise.resolve(
        category === undefined ? SPLIT : veganPage([], [MEAL], 1, false),
      ),
    );
    show();
    await screen.findByRole('button', { name: 'Lentil soup' });

    fireEvent.click(within(chips()).getByRole('button', { name: 'Vegan' }));

    expect(
      await screen.findByText('No community recipes in this category yet'),
    ).toBeTruthy();
  });

  it('UI-38 / UI-36 cards and tiles in a Discover section carry no category tag and nest no button', async () => {
    mocks.api.discover.mockResolvedValue(veganSplit([PUBLIC_RECIPE], [MEAL]));
    const { container } = show();

    await screen.findByRole('button', { name: 'Lentil soup' });
    const articles = container.querySelectorAll('article');
    expect(articles).toHaveLength(2);
    for (const article of Array.from(articles)) {
      expect(within(article as HTMLElement).queryByText('Vegan')).toBeNull();
    }
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('UI-38 cards in the one-category view carry no category tag either', async () => {
    mocks.api.discover.mockImplementation((category?: string) =>
      Promise.resolve(
        category === undefined
          ? SPLIT
          : veganPage([PUBLIC_RECIPE], [MEAL], 1, false),
      ),
    );
    const { container } = show();
    await screen.findByRole('button', { name: 'Lentil soup' });

    fireEvent.click(within(chips()).getByRole('button', { name: 'Vegan' }));

    await waitFor(() =>
      expect(mocks.api.discover).toHaveBeenCalledWith('Vegan'),
    );
    await tileOf('Vegan Lasagna');
    for (const article of Array.from(container.querySelectorAll('article'))) {
      expect(within(article as HTMLElement).queryByText('Vegan')).toBeNull();
    }
  });

  it('DISC-9 Load more appends the next page of recipes and catalogue while hasMore is true', async () => {
    mocks.api.discover.mockImplementation(
      (category?: string, page?: number) =>
        Promise.resolve(
          category === undefined
            ? SPLIT
            : page === 2
              ? veganPage([SECOND_RECIPE], [SECOND_MEAL], 2, false)
              : veganPage([PUBLIC_RECIPE], [MEAL], 1, true),
        ),
    );
    show();
    await screen.findByRole('button', { name: 'Lentil soup' });

    fireEvent.click(within(chips()).getByRole('button', { name: 'Vegan' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() =>
      expect(mocks.api.discover).toHaveBeenCalledWith('Vegan', 2),
    );
    expect(await screen.findByRole('button', { name: 'Chickpea curry' })).toBeTruthy();
    expect(await tileOf('Vegan Chilli')).toBeTruthy();
    // Page 1 stays on screen; page 2 is appended after it.
    expect(screen.getByRole('button', { name: 'Lentil soup' })).toBeTruthy();
    expect(await tileOf('Vegan Lasagna')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Lentil soup' })
        .compareDocumentPosition(screen.getByRole('button', { name: 'Chickpea curry' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // hasMore is false on page 2: no more Load more.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('DISC-9 loads Discover tile images lazily', async () => {
    mocks.api.discover.mockResolvedValue(veganSplit([], [MEAL]));
    const { container } = show();

    await tileOf('Vegan Lasagna');
    const image = container.querySelector('article img');
    expect(image?.getAttribute('loading')).toBe('lazy');
  });
});

/** UI-26: the client's mapped message for a network failure. */
const SERVER_DOWN = "Can't reach CookBook's server.";

/** DISC-4: a TheMealDB tile the caller has no copy of yet. */
const MEAL: CatalogueItemDto = {
  mealId: '52944',
  name: 'Vegan Lasagna',
  thumbnailUrl: '/fixtures/vegan-lasagna.jpg',
  category: 'Vegan',
  myCopyId: null,
};

const SECOND_MEAL: CatalogueItemDto = {
  mealId: '52945',
  name: 'Vegan Chilli',
  thumbnailUrl: '/fixtures/vegan-chilli.jpg',
  category: 'Vegan',
  myCopyId: null,
};

const SECOND_RECIPE: RecipeCardDto = {
  ...PUBLIC_RECIPE,
  id: 'r10',
  title: 'Chickpea curry',
};

/** CAT-3 / UI-21: the copy `POST /recipes/catalogue/:mealId/save` returns. */
const CATALOGUE_COPY: RecipeDetailDto = {
  ...SAVED_COPY,
  id: 'copy-8',
  title: 'Vegan Lasagna',
  source: 'themealdb',
  savedFrom: {
    recipeId: null,
    title: 'Vegan Lasagna',
    ownerUsername: null,
    source: 'themealdb',
  },
  externalImageUrl: '/fixtures/vegan-lasagna.jpg',
};

/** DISC-5: a split view with Beef before Vegan (neither is a favourite yet). */
const BEEF_THEN_VEGAN: DiscoverResponse = {
  categories: [
    {
      category: 'Beef',
      isFavourite: false,
      recipes: [
        {
          ...PUBLIC_RECIPE,
          id: 'r20',
          title: 'Beef Wellington',
          category: 'Beef',
        },
      ],
      catalogue: [],
      page: 1,
      hasMore: false,
    },
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

/** DISC-9: one page of the Vegan one-category view. */
function veganPage(
  recipes: RecipeCardDto[],
  catalogue: CatalogueItemDto[],
  page: number,
  hasMore: boolean,
): DiscoverResponse {
  return {
    categories: [
      { category: 'Vegan', isFavourite: false, recipes, catalogue, page, hasMore },
    ],
    attribution: ATTRIBUTION,
  };
}

/** UI-36: the `article` of the tile whose title button is `name`. */
async function tileOf(name: string): Promise<HTMLElement> {
  const title = await screen.findByRole('button', { name });
  const tile = title.closest('article');
  if (tile === null) {
    throw new Error(`the tile ${name} is not an article`);
  }
  return tile;
}

/** The split view's section headings, in screen order, without their tags. */
function sectionOrder(): string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.firstChild?.textContent ?? '');
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

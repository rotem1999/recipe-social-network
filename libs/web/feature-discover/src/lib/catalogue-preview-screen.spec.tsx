// SPEC.md CAT-3: a catalogue entry is pulled into the database when the user
// saves it, and the shell opens the copy the API created. CAT-7 / DISC-10 /
// UI-14: when the caller already has a copy of the meal (`myCopyId`), the preview
// shows "In your recipes" and a Cook button on that copy in place of Save. The
// thumbnail fixture is a local path: renderer code holds no provider URL (§11.3).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  CataloguePreviewDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { CataloguePreviewScreen } from './catalogue-preview-screen';

const mocks = vi.hoisted(() => ({
  api: {
    cataloguePreview: vi.fn(),
    saveCatalogue: vi.fn(),
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

/** §3.3 fields: mealId, thumbnailUrl, area and the attribution string. */
const PREVIEW: CataloguePreviewDto = {
  mealId: '52944',
  thumbnailUrl: '/fixtures/vegan-lasagna.jpg',
  area: 'Italian',
  attribution: 'Recipe data and imagery: TheMealDB',
  title: 'Vegan Lasagna',
  category: 'Vegan',
  servings: 2,
  ingredients: [{ quantity: 200, unit: 'g', name: 'lasagna sheets' }],
  steps: [{ text: 'Layer and bake.', durationMinutes: 40 }],
  myCopyId: null,
};

/** DISC-10: the same meal when the caller already holds a live copy of it. */
const PREVIEW_WITH_COPY: CataloguePreviewDto = {
  ...PREVIEW,
  myCopyId: 'copy-7',
};

/** SAVE-7 / CAT-7: a saved TheMealDB meal is a saved copy until its first edit. */
const COPY: RecipeDetailDto = {
  id: 'copy-7',
  title: 'Vegan Lasagna',
  category: 'Vegan',
  servings: 2,
  visibility: 'private',
  relation: 'saved',
  ownerUsername: 'rotem',
  source: 'themealdb',
  imageUrl: null,
  rating: null,
  versionNumber: 1,
  updatedAt: '2026-09-28T10:00:00.000Z',
  myCopyId: null,
  updateAvailable: false,
  ingredients: PREVIEW.ingredients,
  steps: PREVIEW.steps,
  imageUrls: [],
  externalImageUrl: PREVIEW.thumbnailUrl,
  canCook: true,
  canEdit: true,
  canRate: false,
  hasComments: false,
  hasVotes: false,
  versionCount: 1,
  forkedFrom: null,
  savedFrom: {
    recipeId: null,
    title: 'Vegan Lasagna',
    ownerUsername: null,
    source: 'themealdb',
  },
  sharedWithUserIds: [],
  attribution: PREVIEW.attribution,
};

function show(handlers: {
  onSaved?: (id: string) => void;
  onCook?: (id: string) => void;
}) {
  return render(
    <CataloguePreviewScreen
      mealId="52944"
      onBack={vi.fn()}
      onSaved={handlers.onSaved ?? vi.fn()}
      onCook={handlers.onCook ?? vi.fn()}
    />,
  );
}

describe('CataloguePreviewScreen', () => {
  beforeEach(() => {
    mocks.api.cataloguePreview.mockReset().mockResolvedValue(PREVIEW);
    mocks.api.saveCatalogue.mockReset().mockResolvedValue(COPY);
  });

  it('CAT-3 saves the catalogue entry and reports the id of the copy', async () => {
    const onSaved = vi.fn();
    show({ onSaved });

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to my recipes/ }),
    );

    await waitFor(() =>
      expect(mocks.api.saveCatalogue).toHaveBeenCalledWith('52944'),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('copy-7'));
  });

  it('CAT-3 shows the API message inline and does not report a save that failed', async () => {
    const onSaved = vi.fn();
    mocks.api.saveCatalogue.mockRejectedValue(
      new Error('Could not reach the catalogue'),
    );
    show({ onSaved });

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to my recipes/ }),
    );

    expect(
      await screen.findByText('Could not reach the catalogue'),
    ).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('DISC-10 offers Save to my recipes and no Cook while the caller has no copy', async () => {
    show({});

    expect(
      await screen.findByRole('button', { name: /Save to my recipes/ }),
    ).toBeTruthy();
    expect(screen.queryByText('In your recipes')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cook$/ })).toBeNull();
  });

  it('DISC-10 replaces Save to my recipes with In your recipes and Cook when myCopyId is set', async () => {
    mocks.api.cataloguePreview.mockResolvedValue(PREVIEW_WITH_COPY);
    show({});

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Cook$/ })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Save to my recipes/ }),
    ).toBeNull();
  });

  it("DISC-10 Cook opens cook mode on the caller's copy and saves nothing", async () => {
    const onCook = vi.fn();
    const onSaved = vi.fn();
    mocks.api.cataloguePreview.mockResolvedValue(PREVIEW_WITH_COPY);
    show({ onCook, onSaved });

    fireEvent.click(await screen.findByRole('button', { name: /^Cook$/ }));

    expect(onCook).toHaveBeenCalledTimes(1);
    expect(onCook).toHaveBeenCalledWith('copy-7');
    expect(mocks.api.saveCatalogue).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('UI-41 gives the title, ingredient names and step text dir="auto"', async () => {
    show({});

    const title = await screen.findByRole('heading', {
      level: 1,
      name: 'Vegan Lasagna',
    });
    expect(title.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('lasagna sheets').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('Layer and bake.').getAttribute('dir')).toBe(
      'auto',
    );
  });

  it('UI-51 / UI-37 formats preview quantities with the shared formatter: "2 pieces", "2½ cups"', async () => {
    mocks.api.cataloguePreview.mockResolvedValue({
      ...PREVIEW,
      ingredients: [
        { quantity: 2, unit: 'piece', name: 'eggs' },
        { quantity: 2.5, unit: 'cup', name: 'milk' },
      ],
    });
    show({});

    expect(await screen.findByText('2 pieces')).toBeTruthy();
    expect(screen.getByText('2½ cups')).toBeTruthy();
    expect(screen.queryByText('2 piece')).toBeNull();
    expect(screen.queryByText('2.5 cup')).toBeNull();
  });

  it('UI-51 / UI-37 keeps the singular after 1 and after a fraction below 1 in the preview', async () => {
    mocks.api.cataloguePreview.mockResolvedValue({
      ...PREVIEW,
      ingredients: [
        { quantity: 1, unit: 'cup', name: 'flour' },
        { quantity: 0.75, unit: 'cup', name: 'sugar' },
        { quantity: 1.5, unit: 'tbsp', name: 'olive oil' },
        { quantity: 0.5, unit: 'piece', name: 'lemon' },
      ],
    });
    show({});

    expect(await screen.findByText('1 cup')).toBeTruthy();
    expect(screen.getByText('¾ cup')).toBeTruthy();
    expect(screen.getByText('1½ tbsp')).toBeTruthy();
    // `piece` never shows fraction glyphs.
    expect(screen.getByText('0.5 pieces')).toBeTruthy();
  });

  it('UI-51 / UI-37 reads an empty quantity as "to taste" with `none` and as the unit alone otherwise', async () => {
    mocks.api.cataloguePreview.mockResolvedValue({
      ...PREVIEW,
      ingredients: [
        { quantity: null, unit: 'none', name: 'salt' },
        { quantity: null, unit: 'pinch', name: 'nutmeg' },
        { quantity: 3, unit: 'none', name: 'onions' },
      ],
    });
    show({});

    expect(await screen.findByText('to taste')).toBeTruthy();
    expect(screen.getByText('pinch')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

// SPEC.md CAT-3: a catalogue entry is pulled into the database when the user
// saves it, and the shell opens the copy the API created. The thumbnail fixture
// is a local path: renderer code holds no provider URL (§11.3).
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
};

const COPY: RecipeDetailDto = {
  id: 'copy-7',
  title: 'Vegan Lasagna',
  category: 'Vegan',
  servings: 2,
  visibility: 'private',
  relation: 'own',
  ownerUsername: 'rotem',
  source: 'themealdb',
  imageUrl: null,
  rating: null,
  versionNumber: 1,
  updatedAt: '2026-09-28T10:00:00.000Z',
  ingredients: PREVIEW.ingredients,
  steps: PREVIEW.steps,
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
  attribution: PREVIEW.attribution,
};

describe('CataloguePreviewScreen', () => {
  beforeEach(() => {
    mocks.api.cataloguePreview.mockReset().mockResolvedValue(PREVIEW);
    mocks.api.saveCatalogue.mockReset().mockResolvedValue(COPY);
  });

  it('CAT-3 saves the catalogue entry and reports the id of the copy', async () => {
    const onSaved = vi.fn();
    render(
      <CataloguePreviewScreen
        mealId="52944"
        onBack={vi.fn()}
        onSaved={onSaved}
      />,
    );

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
    render(
      <CataloguePreviewScreen
        mealId="52944"
        onBack={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to my recipes/ }),
    );

    expect(
      await screen.findByText('Could not reach the catalogue'),
    ).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

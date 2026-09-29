// SPEC.md NUT-11 (the headline range between both estimates, its wording, the
// USDA source line and "Not counted: …"; a response without `estimate` reads as
// null), NUT-4 (the mode switch picks the breakdown, not the headline), NUT-5
// ("nutrition data unavailable"), UI-41 (ingredient names are user text) and
// UI-48 (the breakdown says it is for the recipe as written).
// `@rsn/web/data-access-api` is mocked at the module boundary.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  NutritionEstimateDto,
  NutritionResponse,
} from '@rsn/shared/util-contracts';
import { NutritionPatch } from './nutrition-patch';

const mocks = vi.hoisted(() => ({
  api: { getNutrition: vi.fn() },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
  };
});

/** NUT-6 ingredients mode with one unmatched ingredient (§9 field names). */
function ingredientsResponse(
  estimate: NutritionEstimateDto | null,
): NutritionResponse {
  return {
    mode: 'ingredients',
    servings: 2,
    kcalPerPortion: 240,
    kcalTotal: 480,
    partial: true,
    ingredients: [
      {
        name: 'rice',
        grams: 150,
        kcal: 195,
        matchedDescription: 'Rice, white, cooked',
      },
      {
        name: 'chicken breasts',
        grams: null,
        kcal: null,
        matchedDescription: null,
      },
    ],
    matchedDescription: null,
    source: 'USDA FoodData Central',
    estimate,
  };
}

const RANGE: NutritionEstimateDto = {
  lowKcalPerPortion: 240,
  highKcalPerPortion: 800,
  atLeast: false,
  notCounted: ['chicken breasts', 'stir-fry vegetables'],
};

function headline(container: HTMLElement): string | null {
  return container.querySelector('.nutrition-headline')?.textContent ?? null;
}

describe('NutritionPatch', () => {
  beforeEach(() => {
    mocks.api.getNutrition
      .mockReset()
      .mockResolvedValue(ingredientsResponse(RANGE));
  });

  it('NUT-11 shows "about N–M kcal per portion" when both estimates exist', async () => {
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('about 240–800 kcal per portion'),
    );
    expect(mocks.api.getNutrition).toHaveBeenCalledWith('r1', 'ingredients');
  });

  it('NUT-11 shows "about N kcal per portion" when both ends are the same', async () => {
    mocks.api.getNutrition.mockResolvedValue(
      ingredientsResponse({
        lowKcalPerPortion: 410,
        highKcalPerPortion: 410,
        atLeast: false,
        notCounted: [],
      }),
    );
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('about 410 kcal per portion'),
    );
  });

  it('NUT-11 shows "at least N kcal per portion" when only a partial ingredients value exists', async () => {
    mocks.api.getNutrition.mockResolvedValue(
      ingredientsResponse({
        lowKcalPerPortion: 240,
        highKcalPerPortion: 240,
        atLeast: true,
        notCounted: ['chicken breasts'],
      }),
    );
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('at least 240 kcal per portion'),
    );
    expect(screen.getByText('Not counted: chicken breasts')).toBeTruthy();
  });

  it('NUT-11 NUT-5 shows "nutrition data unavailable" when estimate is null', async () => {
    mocks.api.getNutrition.mockResolvedValue(ingredientsResponse(null));
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('nutrition data unavailable'),
    );
    expect(screen.queryByText(/^Not counted:/)).toBeNull();
  });

  it('NUT-11 reads a response without estimate as null', async () => {
    // An API from before NUT-11 sends no `estimate` field at all.
    const older: Partial<NutritionResponse> = ingredientsResponse(RANGE);
    delete older.estimate;
    mocks.api.getNutrition.mockResolvedValue(older);
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('nutrition data unavailable'),
    );
    expect(screen.queryByText(/^Not counted:/)).toBeNull();
  });

  it('NUT-11 shows the USDA source line and names the ingredients not counted', async () => {
    render(<NutritionPatch recipeId="r1" />);

    expect(
      await screen.findByText(
        'Not counted: chicken breasts, stir-fry vegetables',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Estimate from USDA FoodData Central'),
    ).toBeTruthy();
  });

  it('NUT-11 shows no "Not counted" line when every ingredient was counted', async () => {
    mocks.api.getNutrition.mockResolvedValue(
      ingredientsResponse({ ...RANGE, notCounted: [] }),
    );
    const { container } = render(<NutritionPatch recipeId="r1" />);

    await waitFor(() =>
      expect(headline(container)).toBe('about 240–800 kcal per portion'),
    );
    expect(screen.queryByText(/^Not counted:/)).toBeNull();
    expect(
      screen.getByText('Estimate from USDA FoodData Central'),
    ).toBeTruthy();
  });

  it('NUT-4 NUT-11 switches the breakdown to meal mode and keeps the headline range', async () => {
    mocks.api.getNutrition.mockImplementation(
      async (_id: string, mode: 'ingredients' | 'meal') =>
        mode === 'ingredients'
          ? ingredientsResponse(RANGE)
          : {
              ...ingredientsResponse(RANGE),
              mode: 'meal',
              kcalPerPortion: 800,
              kcalTotal: 1600,
              partial: false,
              ingredients: [],
              matchedDescription: 'Chicken teriyaki with rice',
            },
    );
    const { container } = render(<NutritionPatch recipeId="r1" />);
    await screen.findByText('Not counted: chicken breasts, stir-fry vegetables');

    fireEvent.click(screen.getByRole('radio', { name: 'Meal name' }));

    expect(
      await screen.findByText(
        'Matched "Chicken teriyaki with rice" in FoodData Central.',
      ),
    ).toBeTruthy();
    expect(mocks.api.getNutrition).toHaveBeenLastCalledWith('r1', 'meal');
    expect(headline(container)).toBe('about 240–800 kcal per portion');
    // NUT-11: the names come from the ingredients pass whichever mode is shown.
    expect(
      screen.getByText('Not counted: chicken breasts, stir-fry vegetables'),
    ).toBeTruthy();
  });

  it('NUT-5 names each unmatched ingredient "nutrition data unavailable" in the breakdown', async () => {
    render(<NutritionPatch recipeId="r1" />);

    expect(await screen.findByText('195 kcal')).toBeTruthy();
    expect(screen.getByText('nutrition data unavailable')).toBeTruthy();
  });

  it('UI-48 heads the ingredient breakdown "For the recipe as written (N servings)"', async () => {
    const { container } = render(<NutritionPatch recipeId="r1" />);

    const heading = await screen.findByText(
      'For the recipe as written (2 servings)',
    );
    // The heading sits above the rows it describes.
    const rows = container.querySelector('.nutrition-row');
    expect(rows).not.toBeNull();
    expect(
      heading.compareDocumentPosition(rows as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('UI-48 says "1 serving" when the recipe is written for one', async () => {
    mocks.api.getNutrition.mockResolvedValue({
      ...ingredientsResponse(RANGE),
      servings: 1,
    });
    render(<NutritionPatch recipeId="r1" />);

    expect(
      await screen.findByText('For the recipe as written (1 serving)'),
    ).toBeTruthy();
    expect(screen.queryByText(/1 servings/)).toBeNull();
  });

  it('UI-48 shows no "For the recipe as written" heading in meal mode, which has no rows', async () => {
    mocks.api.getNutrition.mockImplementation(
      async (_id: string, mode: 'ingredients' | 'meal') =>
        mode === 'ingredients'
          ? ingredientsResponse(RANGE)
          : {
              ...ingredientsResponse(RANGE),
              mode: 'meal',
              ingredients: [],
              matchedDescription: 'Chicken teriyaki with rice',
            },
    );
    render(<NutritionPatch recipeId="r1" />);
    await screen.findByText('For the recipe as written (2 servings)');

    fireEvent.click(screen.getByRole('radio', { name: 'Meal name' }));

    await screen.findByText(
      'Matched "Chicken teriyaki with rice" in FoodData Central.',
    );
    expect(screen.queryByText(/For the recipe as written/)).toBeNull();
  });

  it('UI-41 gives the ingredient names of the breakdown dir="auto"', async () => {
    render(<NutritionPatch recipeId="r1" />);

    expect((await screen.findByText('rice')).getAttribute('dir')).toBe('auto');
  });
});

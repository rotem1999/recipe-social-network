// SPEC.md WX-2/WX-4 (the ranked home strip and its weather line), WX-5 ("Show
// another" re-prompts with everything already shown excluded) and WX-10 (an
// empty pick list, and the 429 the shared daily quota of COOK-8 raises).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  RecipeCardDto,
  RecommendResponse,
  RecommendationDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';
import { ApiError } from '@rsn/web/data-access-api';
import { HomeRecommendation } from './recommendations';

const mocks = vi.hoisted(() => ({
  api: { recommend: vi.fn() },
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
    useTimezone: () => TIMEZONE,
  };
});

const TIMEZONE = 'Asia/Jerusalem';

/** WX-10: temperature, is_day, the mapped condition word, local hour and city. */
const WEATHER: WeatherContextDto = {
  city: 'Tel Aviv',
  temperatureC: 14,
  isDay: false,
  condition: 'rain',
  localHour: 20,
  line: 'Cold and rainy in Tel Aviv tonight.',
};

function card(id: string, title: string): RecipeCardDto {
  return {
    id,
    title,
    category: 'Miscellaneous',
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 20,
    visibility: 'private',
    relation: 'saved',
    ownerUsername: 'rotem',
    source: 'user',
    imageUrl: null,
    rating: null,
    versionNumber: 1,
    updatedAt: '2026-09-20T18:00:00.000Z',
  };
}

function pick(id: string, title: string, reason: string): RecommendationDto {
  return { recipe: card(id, title), reason };
}

/** WX-4: the home scope asks for up to 3 ranked picks. */
const FIRST: RecommendResponse = {
  picks: [
    pick('r1', 'Ramen', 'A hot bowl suits a cold, rainy night.'),
    pick('r2', 'Lentil soup', 'Warm and quick.'),
    pick('r3', 'Shakshuka', 'Comfort food from what you have saved.'),
  ],
  weather: WEATHER,
  quota: { used: 4, limit: 100, remaining: 96 },
};

const SECOND: RecommendResponse = {
  picks: [
    pick('r2', 'Lentil soup', 'Warm and quick.'),
    pick('r3', 'Shakshuka', 'Comfort food from what you have saved.'),
    pick('r4', 'Onion soup', 'Slow and warming.'),
  ],
  weather: WEATHER,
  quota: { used: 5, limit: 100, remaining: 95 },
};

describe('HomeRecommendation', () => {
  beforeEach(() => {
    mocks.api.recommend.mockReset().mockResolvedValue(FIRST);
  });

  it('WX-2/WX-4 renders the best pick and reports the weather to the shell', async () => {
    const onWeather = vi.fn();
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={onWeather}
      />,
    );

    expect(await screen.findByText('Ramen')).toBeTruthy();
    expect(
      screen.getByText('A hot bowl suits a cold, rainy night.'),
    ).toBeTruthy();
    expect(mocks.api.recommend).toHaveBeenCalledWith({
      timezone: TIMEZONE,
      scope: 'home',
      excludeRecipeIds: undefined,
    });
    await waitFor(() => expect(onWeather).toHaveBeenCalledWith(WEATHER));
  });

  it('WX-5 re-prompts with the shown recipe excluded when Show another is used', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockResolvedValueOnce(SECOND);
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    await waitFor(() =>
      expect(mocks.api.recommend).toHaveBeenLastCalledWith({
        timezone: TIMEZONE,
        scope: 'home',
        excludeRecipeIds: ['r1'],
      }),
    );
    expect(await screen.findByText('Lentil soup')).toBeTruthy();
  });

  it('WX-10 says there is no recommendation when the model returned no pick', async () => {
    mocks.api.recommend.mockResolvedValue({
      picks: [],
      weather: WEATHER,
      quota: { used: 4, limit: 100, remaining: 96 },
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('No recommendation right now'),
    ).toBeTruthy();
  });

  it('COOK-8 reports the shared daily AI limit when the API answers 429', async () => {
    mocks.api.recommend.mockRejectedValue(
      new ApiError(429, "You've used today's AI requests"),
    );
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    expect(await screen.findByText('Daily AI limit reached')).toBeTruthy();
  });
});

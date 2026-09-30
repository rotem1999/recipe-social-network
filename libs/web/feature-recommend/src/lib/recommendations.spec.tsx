// SPEC.md WX-2/WX-4 (the ranked home strip and its weather line), WX-5 ("Show
// another" re-prompts with everything already shown excluded) and WX-10 (an
// empty pick list, and the 429 the shared daily quota of COOK-8 raises); UI-18
// (the ranked list, its replacement and the empty re-prompt), UI-38 (the
// no-candidates line and the loading texts), UI-41 (dir="auto" on AI text),
// UI-43 (a 400 reads "No recommendation right now"), UI-50 (directional
// title text inside a left-aligned button, clamped like cards) and UI-52 (a
// request abandoned after 20 seconds is the card's message; picks stay).
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  RecipeCardDto,
  RecommendResponse,
  RecommendationDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';
import {
  ApiClient,
  ApiError,
  createEndpoints,
  timeoutError,
  TokenStore,
} from '@rsn/web/data-access-api';
import {
  DiscoverRecommendation,
  HomeRecommendation,
} from './recommendations';

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
    myCopyId: null,
    updateAvailable: false,
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

/** WX-5 / UI-18: the re-prompt excludes r1..r3, so its picks are new ids. */
const SECOND: RecommendResponse = {
  picks: [
    pick('r4', 'Onion soup', 'Slow and warming.'),
    pick('r5', 'Chicken stew', 'Hearty for a wet evening.'),
    pick('r6', 'Pumpkin curry', 'Spiced and warming.'),
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

  it('WX-5 UI-18 re-prompts with every shown pick excluded when Show another is used', async () => {
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
        excludeRecipeIds: ['r1', 'r2', 'r3'],
      }),
    );
    expect(await screen.findByText('Onion soup')).toBeTruthy();
  });

  it('UI-18 lists every pick in the model order, each with its reason and its own Cook it', async () => {
    const onCook = vi.fn();
    const onOpen = vi.fn();
    render(
      <HomeRecommendation onCook={onCook} onOpen={onOpen} onWeather={vi.fn()} />,
    );

    await screen.findByText('Ramen');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(
      rows.map((row) => within(row).getAllByRole('button')[0].textContent),
    ).toEqual(['Ramen', 'Lentil soup', 'Shakshuka']);
    expect(within(rows[1]).getByText('Warm and quick.')).toBeTruthy();
    expect(
      within(rows[2]).getByText('Comfort food from what you have saved.'),
    ).toBeTruthy();

    fireEvent.click(within(rows[1]).getByRole('button', { name: /Cook it/ }));
    expect(onCook).toHaveBeenCalledWith('r2');

    // UI-18: the recipe title opens the recipe.
    fireEvent.click(within(rows[2]).getByRole('button', { name: 'Shakshuka' }));
    expect(onOpen).toHaveBeenCalledWith('r3');
  });

  it('UI-18 Show another replaces the list with the new picks', async () => {
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

    expect(await screen.findByText('Pumpkin curry')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Ramen')).toBeNull();
    expect(screen.queryByText('Lentil soup')).toBeNull();
    expect(screen.queryByText('Shakshuka')).toBeNull();
  });

  it('UI-18 WX-5 excludes the ids of every earlier list, not only the latest one', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockResolvedValueOnce(SECOND)
      .mockResolvedValueOnce({ ...SECOND, picks: [] });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));
    await screen.findByText('Onion soup');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /Show another/,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    await waitFor(() => expect(mocks.api.recommend).toHaveBeenCalledTimes(3));
    expect(mocks.api.recommend).toHaveBeenLastCalledWith({
      timezone: TIMEZONE,
      scope: 'home',
      excludeRecipeIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
    });
  });

  it('UI-18 keeps the list and says "No other suggestions right now" when the re-prompt returns no pick', async () => {
    mocks.api.recommend.mockResolvedValueOnce(FIRST).mockResolvedValueOnce({
      picks: [],
      weather: WEATHER,
      quota: { used: 5, limit: 100, remaining: 95 },
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    expect(
      await screen.findByText('No other suggestions right now'),
    ).toBeTruthy();
    expect(screen.getByText('Ramen')).toBeTruthy();
    expect(screen.getByText('Lentil soup')).toBeTruthy();
    expect(screen.getByText('Shakshuka')).toBeTruthy();
    // UI-18: picks never sit next to "No recommendation right now".
    expect(screen.queryByText('No recommendation right now')).toBeNull();
  });

  it('UI-18 shows no pick row next to "No recommendation right now"', async () => {
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

    await screen.findByText('No recommendation right now');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Cook it/ })).toBeNull();
  });

  it('UNSPECIFIED disables Show another once a response brings fewer picks than the scope asks for', async () => {
    mocks.api.recommend.mockResolvedValue({
      ...FIRST,
      picks: FIRST.picks.slice(0, 2),
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Lentil soup');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /Show another/,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
  });

  it('UNSPECIFIED COOK-8 disables Show another when the shared quota has no request left', async () => {
    mocks.api.recommend.mockResolvedValue({
      ...FIRST,
      quota: { used: 100, limit: 100, remaining: 0 },
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: /Show another/,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
  });

  it('UI-38 shows "Choosing from your recipes…" while the model works on Home', async () => {
    mocks.api.recommend.mockReturnValue(new Promise(() => undefined));
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    expect(await screen.findByText('Choosing from your recipes…')).toBeTruthy();
    expect(screen.queryByText('No recommendation right now')).toBeNull();
  });

  it('UI-38 shows the save-or-write line and hides Show another when the caller has nothing to rank', async () => {
    const onWeather = vi.fn();
    mocks.api.recommend.mockResolvedValue({
      picks: [],
      weather: WEATHER,
      quota: { used: 4, limit: 100, remaining: 96 },
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={onWeather}
        hasCandidates={false}
      />,
    );

    expect(
      screen.getByText(
        "Save or write a recipe and we'll suggest one for the weather.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show another/ })).toBeNull();
    // WX-2: the request still brings the greeting's weather line.
    await waitFor(() => expect(onWeather).toHaveBeenCalledWith(WEATHER));
    expect(screen.queryByText('No recommendation right now')).toBeNull();
  });

  it('UI-38 keeps Show another while it is not yet known whether the caller has recipes', async () => {
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
        hasCandidates={null}
      />,
    );

    await screen.findByText('Ramen');
    expect(screen.getByRole('button', { name: /Show another/ })).toBeTruthy();
    expect(
      screen.queryByText(
        "Save or write a recipe and we'll suggest one for the weather.",
      ),
    ).toBeNull();
  });

  it('UI-41 gives the pick title and the model reason dir="auto"', async () => {
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    const title = await screen.findByRole('button', { name: 'Ramen' });
    // UI-50: the title text is its own directional element inside the button.
    expect(title.querySelector('[dir="auto"]')?.textContent).toBe('Ramen');
    expect(
      screen
        .getByText('A hot bowl suits a cold, rainy night.')
        .getAttribute('dir'),
    ).toBe('auto');
  });

  it('UI-50 keeps the title button left-aligned and puts the title text in a bidi-text span', async () => {
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    const title = await screen.findByRole('button', { name: 'Ramen' });
    expect(title.hasAttribute('dir')).toBe(false);
    const text = title.querySelector('[dir="auto"]');
    expect(text?.classList.contains('bidi-text')).toBe(true);
    const reason = screen.getByText('A hot bowl suits a cold, rainy night.');
    expect(reason.classList.contains('bidi-text')).toBe(true);
  });

  it('UI-50 UI-36 clamps a recommendation title to two lines and keeps the full title in the title attribute', async () => {
    const long =
      'Slow-roasted tomato and chickpea shakshuka with herbs, feta and warm flatbread';
    mocks.api.recommend.mockResolvedValue({
      ...FIRST,
      picks: [pick('r1', long, 'Warm and filling.'), ...FIRST.picks.slice(1)],
    });
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    const title = await screen.findByRole('button', { name: long });
    expect(title.getAttribute('title')).toBe(long);
    const text = title.querySelector('.card-clamp');
    expect(text?.textContent).toBe(long);
    expect(text?.getAttribute('dir')).toBe('auto');
  });

  it('UI-43 shows "No recommendation right now" and not the validator text when POST /recommend answers 400', async () => {
    mocks.api.recommend.mockRejectedValue(
      new ApiError(400, 'Unknown time zone'),
    );
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
    expect(screen.queryByText('Unknown time zone')).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('UI-18 UI-43 keeps the picks and says "No other suggestions right now" when the re-prompt answers 400', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockRejectedValueOnce(new ApiError(400, 'Unknown time zone'));
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    expect(
      await screen.findByText('No other suggestions right now'),
    ).toBeTruthy();
    expect(mocks.api.recommend).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Ramen')).toBeTruthy();
    expect(screen.getByText('Lentil soup')).toBeTruthy();
    expect(screen.getByText('Shakshuka')).toBeTruthy();
    // UI-18: picks never sit next to "No recommendation right now"; UI-43: no validator text.
    expect(screen.queryByText('No recommendation right now')).toBeNull();
    expect(screen.queryByText('Unknown time zone')).toBeNull();
  });

  it('COOK-8 UI-18 keeps the picks and shows "Daily AI limit reached" when the re-prompt answers 429', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockRejectedValueOnce(
        new ApiError(429, "You've used today's AI requests"),
      );
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    expect(await screen.findByText('Daily AI limit reached')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Ramen')).toBeTruthy();
    expect(screen.queryByText('No recommendation right now')).toBeNull();
    expect(screen.queryByText('No other suggestions right now')).toBeNull();
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

  it('UI-52 shows the timeout line as the card message when the first request is abandoned', async () => {
    mocks.api.recommend.mockRejectedValue(timeoutError());
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('The assistant is taking too long. Try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('No recommendation right now')).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('UI-52 UI-18 keeps the picks and shows the timeout line when the re-prompt is abandoned', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockRejectedValueOnce(timeoutError());
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    await screen.findByText('Ramen');
    fireEvent.click(screen.getByRole('button', { name: /Show another/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'The assistant is taking too long. Try again.',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Ramen')).toBeTruthy();
    expect(screen.getByText('Lentil soup')).toBeTruthy();
    expect(screen.getByText('Shakshuka')).toBeTruthy();
    expect(screen.queryByText('No recommendation right now')).toBeNull();
    expect(screen.queryByText('No other suggestions right now')).toBeNull();
  });

  it('UNSPECIFIED UI-52 leaves Show another usable for another try after a timeout', async () => {
    mocks.api.recommend
      .mockResolvedValueOnce(FIRST)
      .mockRejectedValueOnce(timeoutError())
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
    await screen.findByText('The assistant is taking too long. Try again.');
    const more = screen.getByRole('button', { name: /Show another/ });
    await waitFor(() =>
      expect((more as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(more);

    expect(await screen.findByText('Onion soup')).toBeTruthy();
    expect(
      screen.queryByText('The assistant is taking too long. Try again.'),
    ).toBeNull();
    // WX-5: the abandoned request showed nothing new, so the same ids stay excluded.
    expect(mocks.api.recommend).toHaveBeenLastCalledWith({
      timezone: TIMEZONE,
      scope: 'home',
      excludeRecipeIds: ['r1', 'r2', 'r3'],
    });
  });

  it('UNSPECIFIED UI-52 treats only the client timeout as a timeout: a server 408 keeps its own text', async () => {
    mocks.api.recommend.mockRejectedValue(new ApiError(408, 'Request Timeout'));
    render(
      <HomeRecommendation
        onCook={vi.fn()}
        onOpen={vi.fn()}
        onWeather={vi.fn()}
      />,
    );

    expect(await screen.findByText('Request Timeout')).toBeTruthy();
    expect(
      screen.queryByText('The assistant is taking too long. Try again.'),
    ).toBeNull();
  });

  it('UI-52 abandons a real POST /recommend after 20 seconds and shows the timeout line', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const real = createEndpoints(
      new ApiClient(new TokenStore(), 'http://localhost:3000/api/v1'),
    );
    mocks.api.recommend.mockImplementation(real.recommend);
    vi.stubGlobal('fetch', hanging);
    vi.useFakeTimers();
    try {
      render(
        <HomeRecommendation
          onCook={vi.fn()}
          onOpen={vi.fn()}
          onWeather={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(19_999);
      });
      expect(screen.getByText('Choosing from your recipes…')).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(
        screen.getByText('The assistant is taking too long. Try again.'),
      ).toBeTruthy();
      expect(hanging.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('DiscoverRecommendation', () => {
  beforeEach(() => {
    mocks.api.recommend.mockReset().mockResolvedValue({
      picks: [pick('p1', 'Pho', 'Steaming broth for a rainy night.')],
      weather: WEATHER,
      quota: { used: 4, limit: 100, remaining: 96 },
    });
  });

  it('UI-38 shows "Choosing from the community…" while the model works on Discover', async () => {
    mocks.api.recommend.mockReturnValue(new Promise(() => undefined));
    render(<DiscoverRecommendation onOpen={vi.fn()} />);

    expect(
      await screen.findByText('Choosing from the community…'),
    ).toBeTruthy();
  });

  it('WX-10 UI-18 asks the discover scope and gives its one pick a View recipe action', async () => {
    const onOpen = vi.fn();
    render(<DiscoverRecommendation onOpen={onOpen} />);

    expect(await screen.findByText('Pho')).toBeTruthy();
    expect(mocks.api.recommend).toHaveBeenCalledWith({
      timezone: TIMEZONE,
      scope: 'discover',
      excludeRecipeIds: undefined,
    });
    expect(screen.queryByRole('button', { name: /Cook it/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View recipe' }));

    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('UI-43 shows "No recommendation right now" on Discover when POST /recommend answers 400', async () => {
    mocks.api.recommend.mockRejectedValue(
      new ApiError(400, 'Unknown time zone'),
    );
    render(<DiscoverRecommendation onOpen={vi.fn()} />);

    expect(
      await screen.findByText('No recommendation right now'),
    ).toBeTruthy();
    expect(screen.queryByText('Unknown time zone')).toBeNull();
  });

  it('UI-52 shows the timeout line on Discover when the request is abandoned', async () => {
    mocks.api.recommend.mockRejectedValue(timeoutError());
    render(<DiscoverRecommendation onOpen={vi.fn()} />);

    expect(
      await screen.findByText('The assistant is taking too long. Try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('No recommendation right now')).toBeNull();
  });
});

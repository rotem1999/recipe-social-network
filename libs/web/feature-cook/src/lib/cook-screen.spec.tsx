// SPEC.md COOK-1 (the live step tracker), COOK-2 / COOK-9 (one request per
// question, carrying the recipe and the current step, nothing kept between
// steps), COOK-8 (the daily quota, counted server-side and shown here) and
// §3.1.1 (only a step with durationMinutes gets a timer).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  CookAskResponse,
  QuotaDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { CookScreen } from './cook-screen';

const mocks = vi.hoisted(() => ({
  api: {
    getRecipe: vi.fn(),
    cookAsk: vi.fn(),
    cookQuota: vi.fn(),
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

const RECIPE: RecipeDetailDto = {
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
  ingredients: [{ quantity: 2, unit: 'piece', name: 'eggs' }],
  steps: [
    { text: 'Fry the onion.', durationMinutes: 5 },
    { text: 'Add the eggs.' },
  ],
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

/** COOK-8: 100 AI requests a day, counted server-side. */
const QUOTA: QuotaDto = { used: 97, limit: 100, remaining: 3 };

/** §10: the answer carries the model, the token counts and the cost. */
const ANSWER: CookAskResponse = {
  answer: 'Keep the heat medium so the onion sweats without colouring.',
  quota: { used: 98, limit: 100, remaining: 2 },
  model: 'minimax/minimax-m3',
  promptTokens: 412,
  completionTokens: 63,
  cost: 0.0002,
};

function show() {
  return render(<CookScreen recipeId="r1" onExit={onExit} />);
}

const onExit = vi.fn();

describe('CookScreen', () => {
  beforeEach(() => {
    onExit.mockReset();
    mocks.api.getRecipe.mockReset().mockResolvedValue(RECIPE);
    mocks.api.cookQuota.mockReset().mockResolvedValue(QUOTA);
    mocks.api.cookAsk.mockReset().mockResolvedValue(ANSWER);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('COOK-1 starts at step 1 of the recipe and advances with Next step', async () => {
    show();

    expect(await screen.findByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Fry the onion.',
    );

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));

    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Add the eggs.',
    );
  });

  it('COOK-1 leaves cook mode from Finish on the last step', async () => {
    show();

    fireEvent.click(await screen.findByRole('button', { name: /Next step/ }));
    const finish = await screen.findByRole('button', { name: /Finish/ });
    fireEvent.click(finish);

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('COOK-2/COOK-9 asks about the step on screen and shows the answer', async () => {
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Ask about this step/ }),
    );

    await waitFor(() =>
      expect(mocks.api.cookAsk).toHaveBeenCalledWith({
        recipeId: 'r1',
        stepIndex: 0,
        question: undefined,
      }),
    );
    expect(await screen.findByText(ANSWER.answer)).toBeTruthy();
    // COOK-8: the quota of the ask response replaces the one read on entry.
    expect(screen.getByText('2 of 100 AI asks left today')).toBeTruthy();
  });

  it('COOK-9 drops the answer when the step changes', async () => {
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Ask about this step/ }),
    );
    expect(await screen.findByText(ANSWER.answer)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));

    await waitFor(() => expect(screen.queryByText(ANSWER.answer)).toBeNull());
  });

  it('COOK-2 sends the typed question with the step it was asked on', async () => {
    show();

    fireEvent.change(
      await screen.findByLabelText('Question about this step'),
      { target: { value: '  Can I use shallots?  ' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Ask about this step/ }),
    );

    await waitFor(() =>
      expect(mocks.api.cookAsk).toHaveBeenCalledWith({
        recipeId: 'r1',
        stepIndex: 0,
        question: 'Can I use shallots?',
      }),
    );
  });

  it('COOK-8 shows the remaining asks of the day from cookQuota', async () => {
    show();

    expect(
      await screen.findByText('3 of 100 AI asks left today'),
    ).toBeTruthy();
    expect(mocks.api.cookQuota).toHaveBeenCalledTimes(1);
  });

  it('§3.1.1 offers the timer only on a step that carries durationMinutes', async () => {
    show();

    expect(
      await screen.findByRole('button', { name: /Start 5 min timer/ }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));

    await screen.findByText('Step 2 of 2');
    expect(screen.queryByRole('button', { name: /timer/i })).toBeNull();
  });

  it('§3.1.1 counts the step timer down by one second', async () => {
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    expect(screen.getByText('5:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('4:59')).toBeTruthy();
  });
});

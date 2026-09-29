// SPEC.md COOK-1 (the live step tracker), COOK-2 / COOK-9 (one request per
// question, carrying the recipe and the current step, nothing kept between
// steps), COOK-8 (the daily quota, counted server-side and shown here) and
// §3.1.1 (only a step with durationMinutes gets a timer).
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  CookAskResponse,
  QuotaDto,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { CookScreen } from './cook-screen';
import type { CookScreenProps } from './cook-screen';

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
  myCopyId: null,
  updateAvailable: false,
  ingredients: [{ quantity: 2, unit: 'piece', name: 'eggs' }],
  steps: [
    { text: 'Fry the onion.', durationMinutes: 5 },
    { text: 'Add the eggs.' },
  ],
  imageUrls: [],
  externalImageUrl: null,
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

function show(
  props: Pick<CookScreenProps, 'initialStep' | 'onStepChange'> = {},
) {
  return render(<CookScreen recipeId="r1" onExit={onExit} {...props} />);
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

  it('UI-15 opens with the Ingredients panel closed and toggles it', async () => {
    mocks.api.getRecipe.mockResolvedValue({
      ...RECIPE,
      ingredients: [
        { quantity: 2, unit: 'piece', name: 'eggs', note: 'at room temperature' },
      ],
    });
    show();

    const toggle = await screen.findByRole('button', { name: /Ingredients/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('eggs')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('For 2 servings')).toBeTruthy();
    expect(screen.getByText('2 pieces')).toBeTruthy();
    // UI-41: ingredient names and notes follow their own direction.
    expect(screen.getByText('eggs').getAttribute('dir')).toBe('auto');
    expect(screen.getByText('at room temperature').getAttribute('dir')).toBe(
      'auto',
    );

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('eggs')).toBeNull();
  });

  it('UI-15 moves to the next and previous step with → and ←', async () => {
    show();
    await screen.findByText('Step 1 of 2');

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('UI-15 → on the last step and ← on the first stay put; → never finishes', async () => {
    show();
    await screen.findByText('Step 1 of 2');

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('UI-15 ignores ← and → typed in the question box', async () => {
    show();
    const box = await screen.findByLabelText('Question about this step');

    fireEvent.keyDown(box, { key: 'ArrowRight' });

    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('UI-15 asks when Enter is pressed in the question box', async () => {
    show();
    const box = await screen.findByLabelText('Question about this step');
    await screen.findByText('3 of 100 AI asks left today');

    fireEvent.change(box, { target: { value: 'Can I use shallots?' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.api.cookAsk).toHaveBeenCalledWith({
        recipeId: 'r1',
        stepIndex: 0,
        question: 'Can I use shallots?',
      }),
    );
    expect(await screen.findByText(ANSWER.answer)).toBeTruthy();
  });

  it('UI-15 sends one ask when Enter is pressed again while the first is running', async () => {
    mocks.api.cookAsk.mockReturnValue(new Promise<CookAskResponse>(() => undefined));
    show();
    const box = await screen.findByLabelText('Question about this step');
    await screen.findByText('3 of 100 AI asks left today');

    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(mocks.api.cookAsk).toHaveBeenCalledTimes(1);
  });

  it('UNSPECIFIED an Enter that confirms an IME composition does not ask', async () => {
    show();
    const box = await screen.findByLabelText('Question about this step');
    await screen.findByText('3 of 100 AI asks left today');

    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });

    expect(mocks.api.cookAsk).not.toHaveBeenCalled();
  });

  it('UI-15 / COOK-8 disables Ask with No AI asks left today when remaining is 0, and Enter does not ask', async () => {
    mocks.api.cookQuota.mockResolvedValue({ used: 100, limit: 100, remaining: 0 });
    show();

    const ask = await screen.findByRole('button', {
      name: /No AI asks left today/,
    });
    expect((ask as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.queryByRole('button', { name: /Ask about this step/ }),
    ).toBeNull();

    fireEvent.click(ask);
    fireEvent.keyDown(screen.getByLabelText('Question about this step'), {
      key: 'Enter',
    });

    expect(mocks.api.cookAsk).not.toHaveBeenCalled();
  });

  it('UI-15 disables Ask once an ask response brings remaining to 0', async () => {
    mocks.api.cookAsk.mockResolvedValue({
      ...ANSWER,
      quota: { used: 100, limit: 100, remaining: 0 },
    });
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Ask about this step/ }),
    );

    const ask = await screen.findByRole('button', {
      name: /No AI asks left today/,
    });
    expect((ask as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(ANSWER.answer)).toBeTruthy();
  });

  it('UI-15 / UI-41 puts the answer in the scrolling answer box with dir="auto"', async () => {
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: /Ask about this step/ }),
    );

    const answer = await screen.findByText(ANSWER.answer);
    expect(answer.getAttribute('dir')).toBe('auto');
    expect(answer.closest('.cook-answer')).not.toBeNull();
  });

  it('UI-41 gives the recipe title, the step text and the question box dir="auto"', async () => {
    show();

    const step = await screen.findByRole('heading', { level: 1 });
    expect(step.getAttribute('dir')).toBe('auto');
    expect(screen.getByText('Shakshuka').getAttribute('dir')).toBe('auto');
    expect(
      screen.getByLabelText('Question about this step').getAttribute('dir'),
    ).toBe('auto');
  });

  it('UI-15 shows the minutes of a step above 120 minutes and no timer button', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    await screen.findByText('Step 1 of 4');

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));

    expect(screen.getByText('Step 3 of 4')).toBeTruthy();
    expect(screen.getByText(/150 min/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start .* timer/ })).toBeNull();
  });

  it('UI-15 still offers a timer on a step of exactly 120 minutes', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show({ initialStep: 3 });

    expect(await screen.findByText('Step 4 of 4')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Start 120 min timer/ }),
    ).toBeTruthy();
  });

  it('UI-15 keeps a timer running on another step as a Step N · m:ss pill in the top bar', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    const pill = timerPill(1);
    expect(within(pill).getByText('Step 1 · 4:58')).toBeTruthy();
    expect(pill.classList.contains('pulse')).toBe(false);
  });

  it('UI-15 jumps to the timer step when its pill is clicked', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    expect(screen.getByText('Step 3 of 4')).toBeTruthy();

    fireEvent.click(within(timerPill(1)).getByTitle('Go to step 1'));

    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  it('UI-15 dismisses a timer with its × button', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss the step 1 timer' }),
    );

    expect(screen.queryByRole('group', { name: 'Step 1 timer' })).toBeNull();
    // The step offers its timer again.
    expect(
      screen.getByRole('button', { name: /Start 5 min timer/ }),
    ).toBeTruthy();
  });

  it('UI-15 shows Done — 0:00 on a finished pill, which flashes until dismissed', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    const pill = timerPill(1);
    expect(within(pill).getByText('Step 1 · Done — 0:00')).toBeTruthy();
    expect(pill.classList.contains('pulse')).toBe(true);

    // Still there, still flashing, long after zero.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(timerPill(1).classList.contains('pulse')).toBe(true);
    expect(within(timerPill(1)).getByText('Step 1 · Done — 0:00')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss the step 1 timer' }),
    );
    expect(screen.queryByRole('group', { name: 'Step 1 timer' })).toBeNull();
  });

  it('UI-15 shows Done — 0:00 on the step itself when its timer reaches zero', async () => {
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(
      screen.getByRole('button', { name: 'Done — 0:00' }),
    ).toBeTruthy();
  });

  it('UI-15 runs timers of several steps at once, each as its own pill', async () => {
    mocks.api.getRecipe.mockResolvedValue(TIMED_RECIPE);
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start 120 min timer/ }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(within(timerPill(1)).getByText('Step 1 · 4:00')).toBeTruthy();
    expect(within(timerPill(4)).getByText('Step 4 · 119:00')).toBeTruthy();
  });

  it('UI-15 stops every timer when cook mode closes', async () => {
    const { unmount } = show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('UI-15 plays the chime silently without Web Audio (jsdom) and keeps cook mode working', async () => {
    expect((window as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    show();
    const start = await screen.findByRole('button', {
      name: /Start 5 min timer/,
    });

    vi.useFakeTimers();
    fireEvent.click(start);
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(within(timerPill(1)).getByText('Step 1 · Done — 0:00')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('UI-35 opens on initialStep and reports it through onStepChange', async () => {
    const onStepChange = vi.fn();
    show({ initialStep: 1, onStepChange });

    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Add the eggs.',
    );
    expect(onStepChange).toHaveBeenLastCalledWith(1);
  });

  it('UI-35 tells onStepChange each new step', async () => {
    const onStepChange = vi.fn();
    show({ onStepChange });
    await screen.findByText('Step 1 of 2');
    expect(onStepChange).toHaveBeenLastCalledWith(0);

    fireEvent.click(screen.getByRole('button', { name: /Next step/ }));
    expect(onStepChange).toHaveBeenLastCalledWith(1);

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onStepChange).toHaveBeenLastCalledWith(0);
  });

  it('UI-35 clamps a restored step beyond the recipe to its last step', async () => {
    show({ initialStep: 9 });

    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
  });

  it('UI-35 reads a negative restored step as the first step', async () => {
    show({ initialStep: -3 });

    expect(await screen.findByText('Step 1 of 2')).toBeTruthy();
  });
});

/** §3.1.1 / UI-15: timed steps of 5, none, 150 (> 120, no timer) and 120 minutes. */
const TIMED_RECIPE: RecipeDetailDto = {
  ...RECIPE,
  steps: [
    { text: 'Fry the onion.', durationMinutes: 5 },
    { text: 'Add the eggs.' },
    { text: 'Leave the dough to rise.', durationMinutes: 150 },
    { text: 'Bake the bread.', durationMinutes: 120 },
  ],
};

/** UI-15: the top-bar pill of the timer started on 1-based step `step`. */
function timerPill(step: number): HTMLElement {
  return screen.getByRole('group', { name: `Step ${step} timer` });
}

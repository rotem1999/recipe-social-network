// SPEC.md SAVE-2 (who may cook, and Save first from Discover), UI-14 (the
// servings stepper rescales on screen only), RATE-1 (whole-star input on public
// recipes), COM-1 (no comment section without one), UI-12 (the owner row),
// SAVE-9 (the one attribution line of a copy), SAVE-10 (the update banner and
// Sync) and DISC-10 (In your recipes + Start cooking on a recipe the caller has
// a copy of); UI-19 (shared tag and owner byline), UI-20 (catalogue photo),
// UI-24 (comment divider on shared recipes), UI-25 (upload notice), UI-29 (fork
// Sync confirmation), UI-38 (inline SAVE-9 link), UI-41 (dir="auto"), UI-47
// (no rating footnote, the fork banner wording) and UI-50 (bidi-text elements,
// the step minutes tag outside the step text).
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  NutritionResponse,
  RecipeDetailDto,
} from '@rsn/shared/util-contracts';
import { RecipeDetailScreen } from './recipe-detail-screen';
import {
  clearUploadNotice,
  setUploadNotice,
  uploadNoticeText,
} from './upload-notice';

const mocks = vi.hoisted(() => ({
  api: {
    getRecipe: vi.fn(),
    getNutrition: vi.fn(),
    saveRecipe: vi.fn(),
    syncRecipe: vi.fn(),
    rate: vi.fn(),
    listComments: vi.fn(),
    setVisibility: vi.fn(),
    deleteRecipe: vi.fn(),
    listVersions: vi.fn(),
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

const NUTRITION: NutritionResponse = {
  mode: 'ingredients',
  servings: 2,
  kcalPerPortion: 410,
  kcalTotal: 820,
  partial: false,
  ingredients: [
    {
      name: 'flour',
      grams: 200,
      kcal: 728,
      matchedDescription: 'Wheat flour, white, all-purpose',
    },
  ],
  matchedDescription: null,
  source: 'USDA FoodData Central',
  estimate: {
    lowKcalPerPortion: 410,
    highKcalPerPortion: 410,
    atLeast: false,
    notCounted: [],
  },
};

const OWN: RecipeDetailDto = {
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
  description: 'Eggs poached in tomato.',
  ingredients: [{ quantity: 200, unit: 'g', name: 'flour' }],
  steps: [{ text: 'Fry the onion.', durationMinutes: 5 }],
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

/** SAVE-2: a public recipe the viewer has not saved — cook mode is closed to it. */
const PUBLIC_UNSAVED: RecipeDetailDto = {
  ...OWN,
  id: 'r9',
  title: 'Lentil soup',
  ownerUsername: 'noa',
  visibility: 'public',
  relation: 'public',
  canCook: false,
  canEdit: false,
  canRate: true,
  hasComments: true,
  hasVotes: true,
  rating: { average: 4.5, count: 2, mine: null },
};

/** SAVE-7: a copy of Noa's public recipe, not yet edited (a saved copy). */
const SAVED_COPY: RecipeDetailDto = {
  ...OWN,
  id: 'copy-1',
  title: 'Lentil soup',
  relation: 'saved',
  savedFrom: {
    recipeId: 'r9',
    title: 'Lentil soup',
    ownerUsername: 'noa',
    source: 'user',
  },
};

/** SAVE-7: the same copy after its first edit (a fork, relation `own`). */
const FORK: RecipeDetailDto = {
  ...SAVED_COPY,
  relation: 'own',
  savedFrom: null,
  forkedFrom: {
    recipeId: 'r9',
    title: 'Lentil soup',
    ownerUsername: 'noa',
    source: 'user',
  },
};

/** CAT-7 / SAVE-9: a saved TheMealDB meal; `title` is the meal name, no owner. */
const MEAL_COPY: RecipeDetailDto = {
  ...OWN,
  id: 'copy-7',
  title: 'Vegan Lasagna',
  relation: 'saved',
  source: 'themealdb',
  savedFrom: {
    recipeId: null,
    title: 'Vegan Lasagna',
    ownerUsername: null,
    source: 'themealdb',
  },
  attribution: 'Recipe data and imagery: TheMealDB',
};

/** REC-8: Noa's recipe shared with the caller: cookable, comments without votes. */
const SHARED_WITH_ME: RecipeDetailDto = {
  ...OWN,
  id: 'r5',
  title: 'Sabich',
  ownerUsername: 'noa',
  visibility: 'shared',
  relation: 'shared',
  canCook: true,
  canEdit: false,
  canRate: false,
  hasComments: true,
  hasVotes: false,
  sharedWithUserIds: ['u1'],
};

const BANNER_TEXT = 'The original has changed since you saved it';
/** UI-47: a fork's banner says "forked". */
const FORK_BANNER_TEXT = 'The original has changed since you forked it';

/**
 * SAVE-9: the attribution paragraph by its whole text, since the linked title
 * sits in a nested button.
 */
function attributionLine(text: string) {
  return (_content: string, element: Element | null): boolean =>
    element?.tagName === 'P' && element.textContent === text;
}

function show(
  recipe: RecipeDetailDto,
  handlers: {
    onCook?: (id: string) => void;
    onOpenRecipe?: (id: string) => void;
  } = {},
) {
  mocks.api.getRecipe.mockResolvedValue(recipe);
  return render(
    <RecipeDetailScreen
      recipeId={recipe.id}
      backLabel="Home"
      onBack={vi.fn()}
      onCook={handlers.onCook ?? vi.fn()}
      onEdit={vi.fn()}
      onDeleted={vi.fn()}
      onOpenRecipe={handlers.onOpenRecipe ?? vi.fn()}
    />,
  );
}

describe('RecipeDetailScreen', () => {
  beforeEach(() => {
    mocks.api.getRecipe.mockReset().mockResolvedValue(OWN);
    mocks.api.getNutrition.mockReset().mockResolvedValue(NUTRITION);
    mocks.api.saveRecipe.mockReset();
    mocks.api.syncRecipe.mockReset();
    mocks.api.rate.mockReset();
    mocks.api.listComments
      .mockReset()
      .mockResolvedValue({ comments: [], votesEnabled: true });
    mocks.api.setVisibility.mockReset();
    mocks.api.deleteRecipe.mockReset();
    mocks.api.listVersions.mockReset().mockResolvedValue({ versions: [] });
  });

  it('SAVE-2 offers Start cooking when the recipe carries canCook', async () => {
    show(OWN);

    expect(
      await screen.findByRole('button', { name: /Start cooking/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save to cook/ })).toBeNull();
  });

  it('SAVE-2 offers Save to cook on a public recipe the viewer has not saved', async () => {
    show(PUBLIC_UNSAVED);

    expect(
      await screen.findByRole('button', { name: /Save to cook/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start cooking/ })).toBeNull();
  });

  it('SAVE-2 DISC-10 saves the public recipe and then offers Start cooking on the copy', async () => {
    const onCook = vi.fn();
    mocks.api.saveRecipe.mockResolvedValue({
      ...PUBLIC_UNSAVED,
      id: 'copy-1',
      relation: 'saved',
      canCook: true,
      title: 'Lentil soup (copy)',
    });
    show(PUBLIC_UNSAVED, { onCook });

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to cook/ }),
    );

    await waitFor(() =>
      expect(mocks.api.saveRecipe).toHaveBeenCalledWith('r9'),
    );
    const start = await screen.findByRole('button', { name: /Start cooking/ });
    await waitFor(() =>
      expect((start as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.getByText('In your recipes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save to cook/ })).toBeNull();
    // DISC-10: the screen keeps showing the original, not the copy's DTO.
    expect(screen.getByText('Lentil soup')).toBeTruthy();
    expect(screen.queryByText('Lentil soup (copy)')).toBeNull();

    fireEvent.click(start);

    // Cook mode never runs on the public original (SAVE-2).
    expect(onCook).toHaveBeenCalledTimes(1);
    expect(onCook).toHaveBeenCalledWith('copy-1');
  });

  it('UI-14 shows In your recipes and a disabled Start cooking while the save is pending', async () => {
    let resolveSave: (copy: RecipeDetailDto) => void = () => undefined;
    mocks.api.saveRecipe.mockReturnValue(
      new Promise<RecipeDetailDto>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const onCook = vi.fn();
    show(PUBLIC_UNSAVED, { onCook });

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to cook/ }),
    );

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    const start = screen.getByRole('button', { name: /Start cooking/ });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Save to cook/ })).toBeNull();
    fireEvent.click(start);
    expect(onCook).not.toHaveBeenCalled();

    resolveSave({
      ...PUBLIC_UNSAVED,
      id: 'copy-1',
      relation: 'saved',
      canCook: true,
    });
    await waitFor(() =>
      expect((start as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('UI-14 returns to Save to cook with an inline message when the save fails', async () => {
    mocks.api.saveRecipe.mockRejectedValue(
      new Error('Could not save this recipe.'),
    );
    const onCook = vi.fn();
    show(PUBLIC_UNSAVED, { onCook });

    fireEvent.click(
      await screen.findByRole('button', { name: /Save to cook/ }),
    );

    expect(await screen.findByText('Could not save this recipe.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save to cook/ })).toBeTruthy();
    expect(screen.queryByText('In your recipes')).toBeNull();
    expect(screen.queryByRole('button', { name: /Start cooking/ })).toBeNull();
    expect(onCook).not.toHaveBeenCalled();
  });

  it('UI-14 rescales a quantity on screen when the servings stepper is used', async () => {
    show(OWN);

    expect(await screen.findByText('200 g')).toBeTruthy();
    expect(screen.getByText('2 servings')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'More servings' }));

    expect(await screen.findByText('300 g')).toBeTruthy();
    expect(screen.getByText('3 servings')).toBeTruthy();
    // UI-14: the rescale is display only — nothing is written back.
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
  });

  it('RATE-1 shows the whole-star input only when the recipe is rateable', async () => {
    const { unmount } = show(PUBLIC_UNSAVED);

    const stars = await screen.findByRole('radiogroup', {
      name: 'Your rating',
    });
    expect(stars).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeTruthy();
    unmount();

    show(OWN);
    await screen.findByText('Shakshuka');
    expect(
      screen.queryByRole('radiogroup', { name: 'Your rating' }),
    ).toBeNull();
  });

  it('COM-1 renders no comment section when hasComments is false', async () => {
    show(OWN);

    await screen.findByText('Shakshuka');
    expect(screen.queryByRole('region', { name: 'Comments' })).toBeNull();
    expect(mocks.api.listComments).not.toHaveBeenCalled();
  });

  it('COM-1 renders the comment section when hasComments is true', async () => {
    show(PUBLIC_UNSAVED);

    await waitFor(() =>
      expect(mocks.api.listComments).toHaveBeenCalledWith('r9'),
    );
  });

  it('UI-12 shows the owner row only when the viewer may edit', async () => {
    const { unmount } = show(OWN);

    expect(await screen.findByText('Owner')).toBeTruthy();
    unmount();

    show(PUBLIC_UNSAVED);
    await screen.findByText('Lentil soup');
    expect(screen.queryByText('Owner')).toBeNull();
  });

  it('SAVE-9 shows "Saved from <title> by <owner>" as a link to the source on a saved copy', async () => {
    const onOpenRecipe = vi.fn();
    show(SAVED_COPY, { onOpenRecipe });

    expect(
      await screen.findByText(attributionLine('Saved from Lentil soup by noa')),
    ).toBeTruthy();
    expect(screen.queryByText(/Forked from/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lentil soup by noa' }));

    expect(onOpenRecipe).toHaveBeenCalledWith('r9');
  });

  it('SAVE-9 shows the attribution as plain text when the caller can no longer view the source', async () => {
    show({
      ...SAVED_COPY,
      savedFrom: {
        recipeId: null,
        title: 'Lentil soup',
        ownerUsername: 'noa',
        source: 'user',
      },
    });

    expect(
      await screen.findByText(attributionLine('Saved from Lentil soup by noa')),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Lentil soup by noa' }),
    ).toBeNull();
  });

  it('SAVE-9 shows "Forked from <title> by <owner>" once the copy is a fork', async () => {
    const onOpenRecipe = vi.fn();
    show(FORK, { onOpenRecipe });

    expect(
      await screen.findByText(
        attributionLine('Forked from Lentil soup by noa'),
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Saved from/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lentil soup by noa' }));

    expect(onOpenRecipe).toHaveBeenCalledWith('r9');
  });

  it('SAVE-9 shows "Saved from <meal> on TheMealDB" in plain text on a TheMealDB copy', async () => {
    show(MEAL_COPY);

    expect(
      await screen.findByText('Saved from Vegan Lasagna on TheMealDB'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Vegan Lasagna on TheMealDB/ }),
    ).toBeNull();
    // SAVE-9 / §3.3: the attribution string still shows at the bottom.
    expect(screen.getByText('Recipe data and imagery: TheMealDB')).toBeTruthy();
  });

  it('SAVE-9 shows "Forked from <meal> on TheMealDB" in plain text on a TheMealDB fork', async () => {
    show({
      ...MEAL_COPY,
      relation: 'own',
      forkedFrom: MEAL_COPY.savedFrom,
      savedFrom: null,
    });

    expect(
      await screen.findByText('Forked from Vegan Lasagna on TheMealDB'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Vegan Lasagna on TheMealDB/ }),
    ).toBeNull();
  });

  it('SAVE-9 shows no attribution line on a recipe the caller wrote', async () => {
    show(OWN);

    await screen.findByText('Shakshuka');
    expect(screen.queryByText(/Saved from|Forked from/)).toBeNull();
  });

  it('SAVE-10 shows the update banner with Sync and View the original on a saved copy that is behind', async () => {
    const onOpenRecipe = vi.fn();
    show({ ...SAVED_COPY, updateAvailable: true }, { onOpenRecipe });

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText(BANNER_TEXT)).toBeTruthy();
    expect(within(banner).getByRole('button', { name: /Sync/ })).toBeTruthy();

    fireEvent.click(
      within(banner).getByRole('button', { name: 'View the original' }),
    );

    expect(onOpenRecipe).toHaveBeenCalledWith('r9');
  });

  it('SAVE-10 UI-47 shows the update banner on a fork that is behind, saying "since you forked it"', async () => {
    show({ ...FORK, updateAvailable: true });

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText(FORK_BANNER_TEXT)).toBeTruthy();
    expect(within(banner).queryByText(BANNER_TEXT)).toBeNull();
    expect(within(banner).getByRole('button', { name: /Sync/ })).toBeTruthy();
  });

  it('UI-47 keeps "since you saved it" on the banner of a saved copy', async () => {
    show({ ...SAVED_COPY, updateAvailable: true });

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText(BANNER_TEXT)).toBeTruthy();
    expect(within(banner).queryByText(FORK_BANNER_TEXT)).toBeNull();
  });

  it('SAVE-10 shows no update banner when the copy is up to date', async () => {
    show(SAVED_COPY);

    await screen.findByText(attributionLine('Saved from Lentil soup by noa'));
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(screen.queryByRole('button', { name: /Sync/ })).toBeNull();
  });

  it('SAVE-10 Sync posts for the copy and adopts the copy the API returned', async () => {
    mocks.api.syncRecipe.mockResolvedValue({
      ...SAVED_COPY,
      updateAvailable: false,
      versionNumber: 2,
      versionCount: 2,
      steps: [{ text: 'Simmer for an hour.' }],
    });
    show({ ...SAVED_COPY, updateAvailable: true });

    fireEvent.click(await screen.findByRole('button', { name: /Sync/ }));

    await waitFor(() =>
      expect(mocks.api.syncRecipe).toHaveBeenCalledWith('copy-1'),
    );
    expect(await screen.findByText('Simmer for an hour.')).toBeTruthy();
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    // SAVE-10: a sync is not an edit, so the copy stays a saved copy.
    expect(
      screen.getByText(attributionLine('Saved from Lentil soup by noa')),
    ).toBeTruthy();
  });

  it('SAVE-10 shows the API message and keeps the banner when Sync fails', async () => {
    mocks.api.syncRecipe.mockRejectedValue(
      new Error('No update is available.'),
    );
    show({ ...SAVED_COPY, updateAvailable: true });

    fireEvent.click(await screen.findByRole('button', { name: /Sync/ }));

    expect(await screen.findByText('No update is available.')).toBeTruthy();
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy();
    expect(screen.getByText('Fry the onion.')).toBeTruthy();
  });

  it("DISC-10 shows In your recipes and Start cooking on someone else's public recipe the caller has a copy of", async () => {
    const onCook = vi.fn();
    show({ ...PUBLIC_UNSAVED, myCopyId: 'copy-1' }, { onCook });

    expect(await screen.findByText('In your recipes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save to cook/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Start cooking/ }));

    expect(onCook).toHaveBeenCalledTimes(1);
    expect(onCook).toHaveBeenCalledWith('copy-1');
    expect(mocks.api.saveRecipe).not.toHaveBeenCalled();
  });

  it('DISC-10 shows no In your recipes tag on a public recipe the caller has no copy of', async () => {
    show(PUBLIC_UNSAVED);

    await screen.findByRole('button', { name: /Save to cook/ });
    expect(screen.queryByText('In your recipes')).toBeNull();
  });

  it("SAVE-10 shows neither the update banner nor an Update available tag on the original's detail preview", async () => {
    show({ ...PUBLIC_UNSAVED, myCopyId: 'copy-1', updateAvailable: true });

    await screen.findByText('In your recipes');
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
    expect(screen.queryByText('Update available')).toBeNull();
  });

  it('UI-19 tags a recipe shared with the caller "Shared with you by <owner>" and shows no "by <owner>" byline', async () => {
    show({ ...SHARED_WITH_ME, sharedWithUserIds: ['u1', 'u3'] });

    expect(await screen.findByText('Shared with you by noa')).toBeTruthy();
    expect(screen.queryByText(/Shared with \d+ friends?/)).toBeNull();
    // UI-19: the tag already names the owner, so there is no byline.
    expect(screen.queryByText('by noa')).toBeNull();
  });

  it("UI-19 shows the owner's friend count on the owner's own shared recipe and no byline", async () => {
    show({ ...OWN, visibility: 'shared', sharedWithUserIds: ['u2', 'u3'] });

    expect(await screen.findByText('Shared with 2 friends')).toBeTruthy();
    expect(screen.queryByText(/Shared with you by/)).toBeNull();
    expect(screen.queryByText('by rotem')).toBeNull();
  });

  it('UI-19 shows "by <owner>" on a public preview and not on a saved copy', async () => {
    const { unmount } = show(PUBLIC_UNSAVED);

    const byline = await screen.findByText('by noa');
    expect(byline.tagName).toBe('P');
    // UI-19: the same muted line style as the SAVE-9 attribution.
    expect(byline.classList.contains('byline')).toBe(true);
    unmount();

    show(SAVED_COPY);
    await screen.findByText(attributionLine('Saved from Lentil soup by noa'));
    expect(screen.queryByText('by noa')).toBeNull();
  });

  it('UI-20 shows the externalImageUrl of a TheMealDB copy with no uploaded image as its photo', async () => {
    const external = 'https://images.example.test/meals/lasagna.jpg';
    const { container } = show({ ...MEAL_COPY, externalImageUrl: external });

    await screen.findByText('Saved from Vegan Lasagna on TheMealDB');
    const photos = container.querySelectorAll('.photo-row img');
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute('src')).toBe(external);
    // IMG-4: a failing catalogue photo is not a signed URL, so nothing is refetched.
    fireEvent.error(photos[0]);
    expect(mocks.api.getRecipe).toHaveBeenCalledTimes(1);
  });

  it('UI-20 prefers the uploaded images over the catalogue photo', async () => {
    const uploaded = 'https://storage.example.test/bucket/recipes/copy-7/a1.jpg';
    const { container } = show({
      ...MEAL_COPY,
      imageUrls: [uploaded],
      externalImageUrl: 'https://images.example.test/meals/lasagna.jpg',
    });

    await screen.findByText('Saved from Vegan Lasagna on TheMealDB');
    const photos = container.querySelectorAll('.photo-row img');
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute('src')).toBe(uploaded);
  });

  it('UI-20 shows no photo row when there is neither an uploaded image nor a catalogue photo', async () => {
    const { container } = show(OWN);

    await screen.findByText('Shakshuka');
    expect(container.querySelector('.photo-row')).toBeNull();
  });

  it('UI-24 opens the comment section of a shared recipe after the same divider as on a public recipe', async () => {
    show(SHARED_WITH_ME);

    const comments = await screen.findByRole('region', { name: 'Comments' });
    expect(
      comments.previousElementSibling?.classList.contains('hr-section'),
    ).toBe(true);
    expect(
      screen.queryByRole('radiogroup', { name: 'Your rating' }),
    ).toBeNull();
  });

  it('UI-24 draws one divider on a public recipe, above the rating block', async () => {
    const { container } = show(PUBLIC_UNSAVED);

    await screen.findByRole('region', { name: 'Comments' });
    const steps = screen.getByRole('region', { name: 'Steps' });
    expect(steps.querySelectorAll('.hr-section')).toHaveLength(1);
    expect(container.querySelectorAll('.hr-section')).toHaveLength(1);
  });

  it('UI-25 shows the upload notice the editor left for this recipe, once', async () => {
    const text = uploadNoticeText(1, 'Images must be 5 MB or smaller.');
    // UI-47: the notice counts in words.
    expect(text).toBe(
      'The recipe was saved, but 1 image could not be uploaded: Images must be 5 MB or smaller.',
    );
    setUploadNotice('r1', text);
    try {
      const { unmount } = show(OWN);

      expect(await screen.findByText(text)).toBeTruthy();
      unmount();

      show(OWN);
      await screen.findByText('Shakshuka');
      expect(screen.queryByText(text)).toBeNull();
    } finally {
      clearUploadNotice('r1');
    }
  });

  it('UI-29 asks before a fork syncs, and Cancel leaves the fork as it is', async () => {
    mocks.api.syncRecipe.mockResolvedValue({
      ...FORK,
      updateAvailable: false,
      steps: [{ text: 'Simmer for an hour.' }],
    });
    show({ ...FORK, updateAvailable: true });

    fireEvent.click(await screen.findByRole('button', { name: /Sync/ }));

    let dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        "Replace your version with the original's latest?",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('Your changes stay in the version history.'),
    ).toBeTruthy();
    expect(mocks.api.syncRecipe).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.api.syncRecipe).not.toHaveBeenCalled();
    expect(screen.getByText(FORK_BANNER_TEXT)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sync/ }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Sync/ }));

    await waitFor(() =>
      expect(mocks.api.syncRecipe).toHaveBeenCalledWith('copy-1'),
    );
    expect(await screen.findByText('Simmer for an hour.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('UI-29 syncs a saved copy at once, without a confirmation', async () => {
    mocks.api.syncRecipe.mockResolvedValue({
      ...SAVED_COPY,
      updateAvailable: false,
    });
    show({ ...SAVED_COPY, updateAvailable: true });

    fireEvent.click(await screen.findByRole('button', { name: /Sync/ }));

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(mocks.api.syncRecipe).toHaveBeenCalledWith('copy-1'),
    );
  });

  it('UI-38 renders the SAVE-9 source link as an inline text link inside the attribution line', async () => {
    show(SAVED_COPY);

    const link = await screen.findByRole('button', {
      name: 'Lentil soup by noa',
    });
    expect(link.classList.contains('link-button')).toBe(true);
    expect(link.classList.contains('btn')).toBe(false);
    expect(link.parentElement?.tagName).toBe('P');
    expect(link.parentElement?.classList.contains('byline')).toBe(true);
  });

  it('UI-47 shows no footnote under the rating input', async () => {
    show(PUBLIC_UNSAVED);

    const stars = await screen.findByRole('radiogroup', {
      name: 'Your rating',
    });
    expect(stars).toBeTruthy();
    expect(screen.queryByText(/Whole stars only/)).toBeNull();
    expect(screen.queryByText(/quarter steps/)).toBeNull();
  });

  it('UI-50 puts the title, description and step text in bidi-text elements', async () => {
    show(OWN);

    const title = await screen.findByRole('heading', {
      level: 1,
      name: 'Shakshuka',
    });
    expect(title.classList.contains('bidi-text')).toBe(true);
    expect(
      screen.getByText('Eggs poached in tomato.').classList.contains('bidi-text'),
    ).toBe(true);
    const step = screen.getByText('Fry the onion.');
    expect(step.getAttribute('dir')).toBe('auto');
    expect(step.classList.contains('bidi-text')).toBe(true);
  });

  it("UI-50 keeps a step's minutes tag outside its directional text element", async () => {
    show({ ...OWN, steps: [{ text: 'טגנו את הבצל.', durationMinutes: 5 }] });

    const step = await screen.findByText('טגנו את הבצל.');
    expect(step.getAttribute('dir')).toBe('auto');
    const minutes = screen.getByText(/5 min/);
    expect(step.contains(minutes)).toBe(false);
    expect(minutes.closest('[dir]')).toBeNull();
    // Both still sit in the same step row, the tag after the text.
    const row = step.closest('.step-text');
    expect(row).not.toBeNull();
    expect(row?.contains(minutes)).toBe(true);
    expect(
      step.compareDocumentPosition(minutes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('UI-41 gives the title, description, ingredient names and step text dir="auto"', async () => {
    show({
      ...OWN,
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour', note: 'sifted' },
      ],
    });

    const title = await screen.findByRole('heading', {
      level: 1,
      name: 'Shakshuka',
    });
    expect(title.getAttribute('dir')).toBe('auto');
    expect(
      screen.getByText('Eggs poached in tomato.').getAttribute('dir'),
    ).toBe('auto');
    expect(
      screen.getByText('Fry the onion.').closest('[dir]')?.getAttribute('dir'),
    ).toBe('auto');
    const ingredients = screen.getByRole('region', { name: 'Ingredients' });
    expect(
      within(ingredients).getAllByText('flour')[0].getAttribute('dir'),
    ).toBe('auto');
    expect(within(ingredients).getByText('sifted').getAttribute('dir')).toBe(
      'auto',
    );
  });
});

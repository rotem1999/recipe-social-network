// SPEC.md UI-12 (the "Owner" row on the recipe detail screen), SAVE-7 (a saved
// copy is removed with "Remove from my recipes") and SAVE-8 (a saved copy stays
// private, so its row has no Visibility select and no Share…); UI-28 (Shared
// opens the Share dialog without writing, Public asks first, Private writes at
// once) and UI-51 (the Share dialog's Save needs a ticked friend).
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { RecipeDetailDto } from '@rsn/shared/util-contracts';
import { OwnerActions } from './owner-actions';

const mocks = vi.hoisted(() => ({
  api: {
    setVisibility: vi.fn(),
    deleteRecipe: vi.fn(),
    listFriends: vi.fn(),
    shareRecipe: vi.fn(),
    getFriends: vi.fn(),
  },
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => mocks.api,
  };
});

/** A recipe the caller wrote (or a fork, SAVE-7): relation `own`. */
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

/** SAVE-7: a copy saved from a public recipe, not yet edited — relation `saved`. */
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

function show(
  recipe: RecipeDetailDto,
  handlers: {
    onEdit?: (id: string) => void;
    onDeleted?: () => void;
    onChanged?: (recipe: RecipeDetailDto) => void;
  } = {},
) {
  return render(
    <OwnerActions
      recipe={recipe}
      onEdit={handlers.onEdit ?? vi.fn()}
      onChanged={handlers.onChanged ?? vi.fn()}
      onDeleted={handlers.onDeleted ?? vi.fn()}
    />,
  );
}

describe('OwnerActions', () => {
  beforeEach(() => {
    mocks.api.setVisibility.mockReset();
    mocks.api.deleteRecipe.mockReset().mockResolvedValue(undefined);
    mocks.api.listFriends.mockReset().mockResolvedValue({ friends: [] });
    mocks.api.shareRecipe.mockReset();
    mocks.api.getFriends.mockReset().mockResolvedValue({
      friends: [
        { userId: 'u2', username: 'noa', since: '2026-09-10T08:00:00.000Z' },
        { userId: 'u3', username: 'dan', since: '2026-09-12T08:00:00.000Z' },
      ],
      incoming: [],
      outgoing: [],
    });
  });

  it('UI-12 shows Edit, Visibility and Delete on a recipe the caller wrote', () => {
    show(OWN);

    expect(screen.getByRole('button', { name: /Edit/ })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Remove from my recipes/ }),
    ).toBeNull();
  });

  it('UI-12 shows Share… on a recipe the caller wrote when it is shared', () => {
    show({ ...OWN, visibility: 'shared' });

    expect(screen.getByRole('button', { name: /Share…/ })).toBeTruthy();
  });

  it('UI-12 SAVE-8 shows Edit and Remove from my recipes on a saved copy, with no Visibility or Share…', () => {
    show(SAVED_COPY);

    expect(screen.getByRole('button', { name: /Edit/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Remove from my recipes/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Visibility' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Share…/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
  });

  it('SAVE-8 offers no Share… on a saved copy even if its visibility reads shared', () => {
    show({ ...SAVED_COPY, visibility: 'shared' });

    expect(screen.queryByRole('combobox', { name: 'Visibility' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Share…/ })).toBeNull();
  });

  it('UI-12 Edit on a saved copy hands its id to the editor', () => {
    const onEdit = vi.fn();
    show(SAVED_COPY, { onEdit });

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));

    expect(onEdit).toHaveBeenCalledWith('copy-1');
  });

  it('SAVE-7 removes a saved copy only after the confirm dialog', async () => {
    const onDeleted = vi.fn();
    show(SAVED_COPY, { onDeleted });

    fireEvent.click(
      screen.getByRole('button', { name: /Remove from my recipes/ }),
    );
    expect(mocks.api.deleteRecipe).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Remove from my recipes?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(mocks.api.deleteRecipe).toHaveBeenCalledWith('copy-1'),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('UI-28 choosing "Shared with friends" opens the Share dialog without writing, and Cancel leaves the select', async () => {
    show(OWN);
    const select = screen.getByRole('combobox', {
      name: 'Visibility',
    }) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'shared' } });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Share with friends')).toBeTruthy();
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
    expect(select.value).toBe('private');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
    expect(select.value).toBe('private');
  });

  it("UI-28 the Share dialog's Save sends shared with the ticked friends and adopts the answer", async () => {
    const onChanged = vi.fn();
    const shared: RecipeDetailDto = {
      ...OWN,
      visibility: 'shared',
      sharedWithUserIds: ['u2'],
    };
    mocks.api.setVisibility.mockResolvedValue(shared);
    show(OWN, { onChanged });

    fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
      target: { value: 'shared' },
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByLabelText('noa'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.api.setVisibility).toHaveBeenCalledWith('r1', {
        visibility: 'shared',
        sharedWithUserIds: ['u2'],
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(shared));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('UI-51 keeps the Share dialog Save disabled until a friend is ticked', async () => {
    show(OWN);

    fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
      target: { value: 'shared' },
    });
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();

    const noa = await within(dialog).findByLabelText('noa');
    fireEvent.click(noa);
    expect(save.disabled).toBe(false);

    // Unticking the only friend disables Save again.
    fireEvent.click(noa);
    expect(save.disabled).toBe(true);
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
  });

  it('UI-51 enables Save at once when Share… opens on friends the recipe is already shared with', async () => {
    show({ ...OWN, visibility: 'shared', sharedWithUserIds: ['u2'] });

    fireEvent.click(screen.getByRole('button', { name: /Share…/ }));
    const dialog = await screen.findByRole('dialog');
    const noa = (await within(dialog).findByLabelText(
      'noa',
    )) as HTMLInputElement;
    expect(noa.checked).toBe(true);
    const save = within(dialog).getByRole('button', {
      name: 'Save',
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.click(noa);
    expect(save.disabled).toBe(true);
  });

  it('UI-28 choosing "Public" asks "Publish to everyone?" and Cancel writes nothing', async () => {
    show(OWN);
    const select = screen.getByRole('combobox', {
      name: 'Visibility',
    }) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'public' } });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Publish to everyone?')).toBeTruthy();
    expect(
      within(dialog).getByText(
        'Every version of this recipe becomes visible to all users.',
      ),
    ).toBeTruthy();
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.api.setVisibility).not.toHaveBeenCalled();
    expect(select.value).toBe('private');
  });

  it('UI-28 Publish writes public and adopts the recipe the API returned', async () => {
    const onChanged = vi.fn();
    const published: RecipeDetailDto = { ...OWN, visibility: 'public' };
    mocks.api.setVisibility.mockResolvedValue(published);
    show(OWN, { onChanged });

    fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
      target: { value: 'public' },
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Publish',
      }),
    );

    await waitFor(() =>
      expect(mocks.api.setVisibility).toHaveBeenCalledWith('r1', {
        visibility: 'public',
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(published));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('UI-28 choosing "Private" writes at once without a dialog', async () => {
    const onChanged = vi.fn();
    const privateRecipe: RecipeDetailDto = { ...OWN, visibility: 'private' };
    mocks.api.setVisibility.mockResolvedValue(privateRecipe);
    show({ ...OWN, visibility: 'public' }, { onChanged });

    fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
      target: { value: 'private' },
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(mocks.api.setVisibility).toHaveBeenCalledWith('r1', {
        visibility: 'private',
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(privateRecipe));
  });
});

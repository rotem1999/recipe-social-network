// SPEC.md §11.5 UI-16: navigation is in-app state, not a URL router — the auth
// screen replaces everything while signed out, the NavBar frames every signed-in
// screen, and cook mode runs full screen without it. The feature libraries are
// stubbed at their module boundary so only the shell is under test.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RecipeDetailDto, UserDto } from '@rsn/shared/util-contracts';
import App from './app';

const mocks = vi.hoisted(() => ({
  status: 'signed-in' as 'loading' | 'signed-out' | 'signed-in' | 'unreachable',
  user: null as UserDto | null,
  signOut: vi.fn(),
  retry: vi.fn(),
  onCook: vi.fn(),
  // UI-35: the editor-draft clearer the shell calls on the UI-40 Discard.
  clearEditorDraft: vi.fn(),
  // UI-38: what the stubbed HomeScreen passes to its recommendation slot.
  hasCandidates: true,
  // The last props the stubbed CookScreen received (UI-35).
  cookProps: null as null | {
    recipeId: string;
    initialStep?: number;
    onStepChange?: (step: number) => void;
    onExit: () => void;
  },
}));

const USER: UserDto = {
  id: 'u1',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-01T08:00:00.000Z',
};

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    AuthProvider: ({ children }: { children?: unknown }) => children,
    useApi: () => ({}),
    useAuth: () => ({
      user: mocks.status === 'signed-in' ? (mocks.user ?? USER) : null,
      status: mocks.status,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: mocks.signOut,
      refreshUser: vi.fn(),
      retry: mocks.retry,
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

vi.mock('@rsn/web/feature-auth', () => ({
  AuthScreen: () => <div>auth screen</div>,
  UnreachableScreen: () => <div>unreachable screen</div>,
}));

vi.mock('@rsn/web/feature-recipes', async () => {
  const { useEffect } = await import('react');
  return {
    clearEditorDraft: mocks.clearEditorDraft,
    DRAFT_STORAGE_KEY: 'cookbook.draft',
    HomeScreen: ({
      onCook,
      onOpenRecipe,
      recommendationSlot,
    }: {
      onCook: (id: string) => void;
      onOpenRecipe: (id: string) => void;
      recommendationSlot: (slot: { hasCandidates: boolean }) => ReactNode;
    }) => (
      <div>
        home screen
        <button type="button" onClick={() => onCook('r1')}>
          cook r1
        </button>
        <button type="button" onClick={() => onOpenRecipe('r1')}>
          open r1
        </button>
        {recommendationSlot({ hasCandidates: mocks.hasCandidates })}
      </div>
    ),
    RecipeDetailScreen: ({
      recipeId,
      backLabel,
      onBack,
      onCook,
      onEdit,
    }: {
      recipeId: string;
      backLabel: string;
      onBack: () => void;
      onCook: (id: string) => void;
      onEdit: (id: string) => void;
    }) => (
      <div>
        <p>recipe detail {recipeId}</p>
        <p>back to {backLabel}</p>
        <button type="button" onClick={onBack}>
          detail back
        </button>
        <button type="button" onClick={() => onCook(recipeId)}>
          detail cook
        </button>
        <button type="button" onClick={() => onEdit(recipeId)}>
          detail edit
        </button>
      </div>
    ),
    RecipeEditorScreen: ({
      recipeId,
      onSaved,
      onCancel,
      onDirtyChange,
    }: {
      recipeId?: string;
      onSaved: (recipe: RecipeDetailDto) => void;
      onCancel: () => void;
      onDirtyChange?: (dirty: boolean) => void;
    }) => {
      // Like the real editor: it reports false when it unmounts (UI-40).
      useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
      return (
        <div>
          <p>recipe editor {recipeId ?? 'new'}</p>
          <button type="button" onClick={() => onDirtyChange?.(true)}>
            editor type
          </button>
          <button type="button" onClick={onCancel}>
            editor cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onSaved({ id: recipeId ?? 'r9' } as RecipeDetailDto)
            }
          >
            editor save
          </button>
        </div>
      );
    },
  };
});

vi.mock('@rsn/web/feature-discover', () => ({
  DiscoverScreen: ({
    onOpenRecipe,
    onOpenCatalogue,
    onCook,
    recommendationSlot,
  }: {
    onOpenRecipe: (id: string) => void;
    onOpenCatalogue: (mealId: string) => void;
    onCook: (id: string) => void;
    recommendationSlot: ReactNode;
  }) => (
    <div>
      discover screen
      <button type="button" onClick={() => onOpenRecipe('r2')}>
        open r2
      </button>
      <button type="button" onClick={() => onOpenCatalogue('52772')}>
        open meal 52772
      </button>
      <button type="button" onClick={() => onCook('r2')}>
        cook r2
      </button>
      {recommendationSlot}
    </div>
  ),
  CataloguePreviewScreen: ({
    mealId,
    onBack,
    onSaved,
    onCook,
  }: {
    mealId: string;
    onBack: () => void;
    onSaved: (id: string) => void;
    onCook: (id: string) => void;
  }) => (
    <div>
      <p>catalogue preview {mealId}</p>
      <button type="button" onClick={onBack}>
        preview back
      </button>
      <button type="button" onClick={() => onSaved('copy1')}>
        preview save
      </button>
      <button type="button" onClick={() => onCook('copy1')}>
        preview cook
      </button>
    </div>
  ),
}));

vi.mock('@rsn/web/feature-friends', () => ({
  FriendsScreen: () => <div>friends screen</div>,
}));

vi.mock('@rsn/web/feature-cook', () => ({
  CookScreen: (props: {
    recipeId: string;
    initialStep?: number;
    onStepChange?: (step: number) => void;
    onExit: () => void;
  }) => {
    mocks.cookProps = props;
    return (
      <div>
        cook screen
        <button type="button" onClick={props.onExit}>
          cook exit
        </button>
      </div>
    );
  },
}));

vi.mock('@rsn/web/feature-recommend', () => ({
  HomeRecommendation: ({ hasCandidates }: { hasCandidates?: boolean }) => (
    <div>home recommendation {String(hasCandidates)}</div>
  ),
  DiscoverRecommendation: () => <div>discover recommendation</div>,
}));

const ROUTE_KEY = 'cookbook.route';

/** UI-35: what the shell mirrored into sessionStorage. */
function savedRoute(): unknown {
  const text = sessionStorage.getItem(ROUTE_KEY);
  return text === null ? null : JSON.parse(text);
}

function click(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

/** UI-16 / UI-23: the nav tab the header highlights. */
function activeTab(): string | null {
  const current = screen
    .getByRole('banner')
    .querySelector('[aria-current="page"]');
  return current?.textContent ?? null;
}

describe('App', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.user = null;
    mocks.hasCandidates = true;
    mocks.cookProps = null;
    mocks.signOut.mockReset();
    mocks.retry.mockReset();
    // UI-35: every test starts without a saved route.
    sessionStorage.clear();
  });

  it('UI-16 shows the auth screen and no nav bar while signed out', () => {
    mocks.status = 'signed-out';
    render(<App />);

    expect(screen.getByText('auth screen')).toBeTruthy();
    expect(screen.queryByText('CookBook')).toBeNull();
  });

  it('UI-16 frames the signed-in home screen with the CookBook nav bar', () => {
    render(<App />);

    expect(screen.getByText('CookBook')).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByText('home screen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discover' })).toBeTruthy();
  });

  it('UI-16 switches tab without leaving the shell', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Discover' }));

    expect(screen.getByText('discover screen')).toBeTruthy();
    expect(screen.getByText('CookBook')).toBeTruthy();
  });

  it('UI-16 hides the nav bar on the cook route', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'cook r1' }));

    expect(screen.getByText('cook screen')).toBeTruthy();
    expect(screen.queryByText('CookBook')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('AUTH-8 shows Loading… and no nav bar until the stored token has been checked', () => {
    mocks.status = 'loading';
    render(<App />);

    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByText('auth screen')).toBeNull();
  });

  it('UI-26 shows the full-screen unreachable screen, not sign-in, when the start-up GET /me could not reach the server', () => {
    mocks.status = 'unreachable';
    render(<App />);

    expect(screen.getByText('unreachable screen')).toBeTruthy();
    expect(screen.queryByText('auth screen')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('UI-26 / UI-9 returns to the sign-in screen as soon as the session ends', () => {
    const { rerender } = render(<App />);
    expect(screen.getByText('home screen')).toBeTruthy();

    mocks.status = 'signed-out';
    rerender(<App />);

    expect(screen.getByText('auth screen')).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
  });
});

describe('App route storage (UI-35)', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.user = null;
    mocks.cookProps = null;
    sessionStorage.clear();
  });

  it('UI-35 restores the saved route for the same user after a reload', () => {
    sessionStorage.setItem(
      ROUTE_KEY,
      JSON.stringify({ userId: 'u1', route: { name: 'discover' } }),
    );

    render(<App />);

    expect(screen.getByText('discover screen')).toBeTruthy();
    expect(activeTab()).toBe('Discover');
  });

  it("UI-35 ignores a route saved for another user and starts on Home", () => {
    sessionStorage.setItem(
      ROUTE_KEY,
      JSON.stringify({ userId: 'u2', route: { name: 'discover' } }),
    );

    render(<App />);

    expect(screen.getByText('home screen')).toBeTruthy();
    expect(activeTab()).toBe('Home');
  });

  it('UI-35 ignores a malformed saved route and starts on Home', () => {
    sessionStorage.setItem(ROUTE_KEY, '{not json');

    render(<App />);

    expect(screen.getByText('home screen')).toBeTruthy();
  });

  it('UI-35 restores the editor route (the editor restores its own unsaved fields)', () => {
    sessionStorage.setItem(
      ROUTE_KEY,
      JSON.stringify({
        userId: 'u1',
        route: { name: 'editor', id: 'r1', from: 'discover' },
      }),
    );

    render(<App />);

    expect(screen.getByText('recipe editor r1')).toBeTruthy();
    expect(activeTab()).toBe('Discover');
  });

  it('UI-35 restores cook mode on the saved step through initialStep', () => {
    sessionStorage.setItem(
      ROUTE_KEY,
      JSON.stringify({
        userId: 'u1',
        route: { name: 'cook', id: 'r5', from: 'discover' },
        step: 3,
      }),
    );

    render(<App />);

    expect(screen.getByText('cook screen')).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(mocks.cookProps?.recipeId).toBe('r5');
    expect(mocks.cookProps?.initialStep).toBe(3);
    expect(typeof mocks.cookProps?.onStepChange).toBe('function');
  });

  it('UI-35 mirrors the current route into sessionStorage', () => {
    render(<App />);

    click('Discover');

    expect(savedRoute()).toEqual({ userId: 'u1', route: { name: 'discover' } });

    click('open r2');

    expect(savedRoute()).toEqual({
      userId: 'u1',
      route: { name: 'recipe', id: 'r2', from: 'discover' },
    });
  });

  it('UI-35 mirrors the step cook mode reports through onStepChange', () => {
    render(<App />);
    click('cook r1');

    expect(mocks.cookProps?.initialStep).toBeUndefined();

    act(() => mocks.cookProps?.onStepChange?.(2));

    expect(savedRoute()).toEqual({
      userId: 'u1',
      route: { name: 'cook', id: 'r1', from: 'home' },
      step: 2,
    });
  });

  it('UI-35 starts a newly opened cook mode on the first step', () => {
    render(<App />);
    click('cook r1');
    act(() => mocks.cookProps?.onStepChange?.(4));

    click('cook exit');
    click('detail cook');

    expect(mocks.cookProps?.initialStep).toBeUndefined();
    expect(savedRoute()).toEqual({
      userId: 'u1',
      route: { name: 'cook', id: 'r1', from: 'home' },
    });
  });

  it("UI-35 starts another account on Home, not on the previous user's route", () => {
    const { rerender } = render(<App />);
    click('Discover');
    expect(screen.getByText('discover screen')).toBeTruthy();

    mocks.user = { ...USER, id: 'u2', username: 'dana' };
    rerender(<App />);

    expect(screen.getByText('home screen')).toBeTruthy();
    expect(savedRoute()).toEqual({ userId: 'u2', route: { name: 'home' } });
  });

  it('UI-35 keeps the route when the same user signs in again after the session ended', () => {
    const { rerender } = render(<App />);
    click('Discover');

    mocks.status = 'signed-out';
    rerender(<App />);
    expect(screen.getByText('auth screen')).toBeTruthy();

    mocks.status = 'signed-in';
    rerender(<App />);

    expect(screen.getByText('discover screen')).toBeTruthy();
  });
});

describe('App route origins (UI-23)', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.user = null;
    sessionStorage.clear();
  });

  it('UI-23 a recipe opened from Home goes back to Home', () => {
    render(<App />);
    click('open r1');

    expect(screen.getByText('recipe detail r1')).toBeTruthy();
    expect(screen.getByText('back to Home')).toBeTruthy();
    expect(activeTab()).toBe('Home');

    click('detail back');

    expect(screen.getByText('home screen')).toBeTruthy();
  });

  it('UI-23 a recipe opened from Discover goes back to Discover and keeps the Discover tab lit', () => {
    render(<App />);
    click('Discover');
    click('open r2');

    expect(screen.getByText('recipe detail r2')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
    expect(activeTab()).toBe('Discover');

    click('detail back');

    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-23 the TheMealDB preview goes back to Discover', () => {
    render(<App />);
    click('Discover');
    click('open meal 52772');

    expect(screen.getByText('catalogue preview 52772')).toBeTruthy();
    expect(activeTab()).toBe('Discover');

    click('preview back');

    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it("UI-23 the copy opened by the preview's Save goes back to Discover", () => {
    render(<App />);
    click('Discover');
    click('open meal 52772');
    click('preview save');

    expect(screen.getByText('recipe detail copy1')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
    expect(activeTab()).toBe('Discover');

    click('detail back');

    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-23 leaving cook mode started from the preview opens the recipe with Back to Discover', () => {
    render(<App />);
    click('Discover');
    click('open meal 52772');
    click('preview cook');

    expect(screen.getByText('cook screen')).toBeTruthy();

    click('cook exit');

    expect(screen.getByText('recipe detail copy1')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
    expect(activeTab()).toBe('Discover');
  });

  it('UI-23 leaving cook mode started on Discover opens the recipe with Back to Discover', () => {
    render(<App />);
    click('Discover');
    click('cook r2');
    click('cook exit');

    expect(screen.getByText('recipe detail r2')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
    expect(activeTab()).toBe('Discover');

    click('detail back');

    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-23 leaving cook mode started on Home opens the recipe with Back to Home', () => {
    render(<App />);
    click('cook r1');
    click('cook exit');

    expect(screen.getByText('recipe detail r1')).toBeTruthy();
    expect(screen.getByText('back to Home')).toBeTruthy();
    expect(activeTab()).toBe('Home');
  });

  it('UI-23 cook mode started from a Discover recipe returns to that recipe with Back to Discover', () => {
    render(<App />);
    click('Discover');
    click('open r2');
    click('detail cook');
    click('cook exit');

    expect(screen.getByText('recipe detail r2')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
  });

  it('UI-23 editing a recipe opened from Discover keeps the Discover origin through Save', () => {
    render(<App />);
    click('Discover');
    click('open r2');
    click('detail edit');

    expect(screen.getByText('recipe editor r2')).toBeTruthy();
    expect(activeTab()).toBe('Discover');

    click('editor save');

    expect(screen.getByText('recipe detail r2')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
  });

  it('UI-23 cancelling an unchanged edit returns to the recipe with its origin', () => {
    render(<App />);
    click('Discover');
    click('open r2');
    click('detail edit');
    click('editor cancel');

    expect(screen.getByText('recipe detail r2')).toBeTruthy();
    expect(screen.getByText('back to Discover')).toBeTruthy();
  });

  it('UI-23 cancelling an unchanged new recipe returns to the screen it was started from', () => {
    render(<App />);
    click('Friends');
    click('New recipe');

    expect(screen.getByText('recipe editor new')).toBeTruthy();
    // UI-23: a new recipe's editor highlights Home, whatever opened it.
    expect(activeTab()).toBe('Home');

    click('editor cancel');

    expect(screen.getByText('friends screen')).toBeTruthy();
  });
});

describe('App Home recommendation slot (UI-38)', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.user = null;
    sessionStorage.clear();
  });

  it('UI-38 passes hasCandidates true to the Home recommendation card', () => {
    mocks.hasCandidates = true;
    render(<App />);

    expect(screen.getByText('home recommendation true')).toBeTruthy();
  });

  it('UI-38 passes hasCandidates false when Home has no own or saved recipes', () => {
    mocks.hasCandidates = false;
    render(<App />);

    expect(screen.getByText('home recommendation false')).toBeTruthy();
  });
});

describe('App unsaved-editor guard (UI-40)', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.user = null;
    mocks.signOut.mockReset();
    mocks.clearEditorDraft.mockReset();
    sessionStorage.clear();
  });

  /** Opens a new-recipe editor and changes a field. */
  function openDirtyEditor(): void {
    click('New recipe');
    click('editor type');
  }

  function discardDialog(): HTMLElement | null {
    return screen.queryByRole('dialog', { name: 'Discard your changes?' });
  }

  it('UI-40 asks "Discard your changes?" before a nav tab leaves a changed editor', () => {
    render(<App />);
    openDirtyEditor();

    click('Discover');

    expect(discardDialog()).not.toBeNull();
    expect(screen.getByText('recipe editor new')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('UI-40 Keep editing stays in the editor', () => {
    render(<App />);
    openDirtyEditor();
    click('Discover');

    click('Keep editing');

    expect(discardDialog()).toBeNull();
    expect(screen.getByText('recipe editor new')).toBeTruthy();
  });

  it('UI-40 Discard leaves for the tab that was chosen', () => {
    render(<App />);
    openDirtyEditor();
    click('Discover');

    click('Discard');

    expect(discardDialog()).toBeNull();
    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-40 an unchanged editor leaves by a nav tab without asking', () => {
    render(<App />);
    click('New recipe');

    click('Friends');

    expect(discardDialog()).toBeNull();
    expect(screen.getByText('friends screen')).toBeTruthy();
  });

  it('UI-40 asks before New recipe leaves a changed editor', () => {
    render(<App />);
    click('open r1');
    click('detail edit');
    click('editor type');

    click('New recipe');

    expect(discardDialog()).not.toBeNull();
    expect(screen.getByText('recipe editor r1')).toBeTruthy();

    click('Discard');

    expect(screen.getByText('recipe editor new')).toBeTruthy();
  });

  it('UI-40 asks before Cancel leaves a changed editor', () => {
    render(<App />);
    click('Discover');
    openDirtyEditor();

    click('editor cancel');

    expect(discardDialog()).not.toBeNull();
    expect(screen.getByText('recipe editor new')).toBeTruthy();

    click('Discard');

    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-40 asks before sign-out leaves a changed editor, and signs out only on Discard', () => {
    render(<App />);
    openDirtyEditor();

    click('Account menu for rotem');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(discardDialog()).not.toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();

    click('Keep editing');
    expect(mocks.signOut).not.toHaveBeenCalled();

    click('Account menu for rotem');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    click('Discard');

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('UI-40 signs out at once when no editor has changes', () => {
    render(<App />);

    click('Account menu for rotem');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

    expect(discardDialog()).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('UI-35 UI-40 Discard clears the editor draft before leaving for the chosen tab', () => {
    render(<App />);
    openDirtyEditor();
    click('Discover');
    expect(mocks.clearEditorDraft).not.toHaveBeenCalled();

    click('Discard');

    expect(mocks.clearEditorDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByText('discover screen')).toBeTruthy();
  });

  it('UI-35 UI-40 Keep editing keeps the editor draft', () => {
    render(<App />);
    openDirtyEditor();
    click('Discover');

    click('Keep editing');

    expect(mocks.clearEditorDraft).not.toHaveBeenCalled();
  });

  it('UI-35 UI-40 Discard on sign-out clears the editor draft before signing out', () => {
    render(<App />);
    openDirtyEditor();

    click('Account menu for rotem');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    click('Discard');

    expect(mocks.clearEditorDraft).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.clearEditorDraft.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('UI-35 keeps the editor draft when the session ends under a changed editor', () => {
    const { rerender } = render(<App />);
    openDirtyEditor();

    mocks.status = 'signed-out';
    rerender(<App />);

    expect(screen.getByText('auth screen')).toBeTruthy();
    expect(mocks.clearEditorDraft).not.toHaveBeenCalled();
  });

  it('UI-35 the shell leaves the draft to the editor when nothing asked: an unchanged editor or Save', () => {
    render(<App />);
    click('New recipe');
    click('Friends');
    openDirtyEditor();
    click('editor save');

    expect(mocks.clearEditorDraft).not.toHaveBeenCalled();
  });

  it('UI-40 Save leaves a changed editor without asking', () => {
    render(<App />);
    openDirtyEditor();

    click('editor save');

    expect(discardDialog()).toBeNull();
    expect(screen.getByText('recipe detail r9')).toBeTruthy();

    // The editor is gone, so leaving the recipe asks nothing either.
    click('Discover');

    expect(discardDialog()).toBeNull();
    expect(screen.getByText('discover screen')).toBeTruthy();
  });
});

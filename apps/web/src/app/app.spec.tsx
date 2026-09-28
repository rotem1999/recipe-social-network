// SPEC.md §11.5 UI-16: navigation is in-app state, not a URL router — the auth
// screen replaces everything while signed out, the NavBar frames every signed-in
// screen, and cook mode runs full screen without it. The feature libraries are
// stubbed at their module boundary so only the shell is under test.
import { fireEvent, render, screen } from '@testing-library/react';
import type { UserDto } from '@rsn/shared/util-contracts';
import App from './app';

const mocks = vi.hoisted(() => ({
  status: 'signed-in' as 'loading' | 'signed-out' | 'signed-in',
  signOut: vi.fn(),
  onCook: vi.fn(),
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
      user: mocks.status === 'signed-in' ? USER : null,
      status: mocks.status,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: mocks.signOut,
      refreshUser: vi.fn(),
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

vi.mock('@rsn/web/feature-auth', () => ({
  AuthScreen: () => <div>auth screen</div>,
}));

vi.mock('@rsn/web/feature-recipes', () => ({
  HomeScreen: ({ onCook }: { onCook: (id: string) => void }) => (
    <div>
      home screen
      <button type="button" onClick={() => onCook('r1')}>
        cook r1
      </button>
    </div>
  ),
  RecipeDetailScreen: () => <div>recipe detail</div>,
  RecipeEditorScreen: () => <div>recipe editor</div>,
}));

vi.mock('@rsn/web/feature-discover', () => ({
  DiscoverScreen: () => <div>discover screen</div>,
  CataloguePreviewScreen: () => <div>catalogue preview</div>,
}));

vi.mock('@rsn/web/feature-friends', () => ({
  FriendsScreen: () => <div>friends screen</div>,
}));

vi.mock('@rsn/web/feature-cook', () => ({
  CookScreen: () => <div>cook screen</div>,
}));

vi.mock('@rsn/web/feature-recommend', () => ({
  HomeRecommendation: () => <div>home recommendation</div>,
  DiscoverRecommendation: () => <div>discover recommendation</div>,
}));

describe('App', () => {
  beforeEach(() => {
    mocks.status = 'signed-in';
    mocks.signOut.mockReset();
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
});

// SPEC.md §11.5 UI-9 and §2 AUTH-5: the one sign-in / sign-up screen.
// `@rsn/web/data-access-api` is mocked at the module boundary so no request and
// no token store is touched (libs/web/CLAUDE.md).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserDto } from '@rsn/shared/util-contracts';
import { ApiError } from '@rsn/web/data-access-api';
import { AuthScreen } from './auth-screen';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshUser: vi.fn(),
}));

vi.mock('@rsn/web/data-access-api', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rsn/web/data-access-api')>();
  return {
    ...actual,
    useApi: () => ({}),
    useAuth: () => ({
      user: USER,
      status: 'signed-in',
      signIn: mocks.signIn,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      refreshUser: mocks.refreshUser,
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

const USER: UserDto = {
  id: 'u1',
  username: 'rotem',
  email: null,
  favouriteCategories: [],
  createdAt: '2026-09-01T08:00:00.000Z',
};

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('AuthScreen', () => {
  beforeEach(() => {
    mocks.signIn.mockReset().mockResolvedValue(USER);
    mocks.signUp.mockReset().mockResolvedValue(USER);
  });

  it('UI-9/AUTH-5 sends the username lower-cased on sign-in', async () => {
    render(<AuthScreen />);

    type('Username', '  RoTeM  ');
    type('Password', 'correct-horse');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledTimes(1));
    expect(mocks.signIn).toHaveBeenCalledWith({
      username: 'rotem',
      password: 'correct-horse',
    });
  });

  it('AUTH-5 refuses a 5-character password inline and does not submit', async () => {
    render(<AuthScreen />);

    type('Username', 'rotem');
    type('Password', 'abcde');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('UI-9 reveals the optional email field when the switch moves to sign-up', () => {
    render(<AuthScreen />);

    expect(screen.queryByLabelText('Email (optional)')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Sign up' }));

    expect(screen.getByLabelText('Email (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });

  it("UI-9 shows the API's ApiError message inline under the form", async () => {
    mocks.signIn.mockRejectedValue(new ApiError(401, 'Wrong username or password'));
    render(<AuthScreen />);

    type('Username', 'rotem');
    type('Password', 'correct-horse');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByText('Wrong username or password');
    expect(alert.getAttribute('role')).toBe('alert');
  });
});

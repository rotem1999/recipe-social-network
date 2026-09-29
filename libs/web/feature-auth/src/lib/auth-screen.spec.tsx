// SPEC.md §11.5 UI-9 and §2 AUTH-5: the one sign-in / sign-up screen.
// `@rsn/web/data-access-api` is mocked at the module boundary so no request and
// no token store is touched (libs/web/CLAUDE.md).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserDto } from '@rsn/shared/util-contracts';
import { ApiError, NETWORK_ERROR_MESSAGE } from '@rsn/web/data-access-api';
import { AuthScreen, SESSION_ENDED_MESSAGE } from './auth-screen';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshUser: vi.fn(),
  auth: { sessionEnded: false },
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
      sessionEnded: mocks.auth.sessionEnded,
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
    mocks.auth.sessionEnded = false;
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

  it("UI-26 shows the client's status-0 message inline when the server cannot be reached", async () => {
    mocks.signIn.mockRejectedValue(new ApiError(0, NETWORK_ERROR_MESSAGE));
    render(<AuthScreen />);

    type('Username', 'rotem');
    type('Password', 'correct-horse');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByText("Can't reach CookBook's server.");
    expect(alert.getAttribute('role')).toBe('alert');
  });

  it("UI-44 uses SPEC's exact wording for the session-ended message", () => {
    expect(SESSION_ENDED_MESSAGE).toBe('Your session ended. Sign in again.');
  });

  it('UI-44 shows "Your session ended. Sign in again." above the form when the session ended', () => {
    mocks.auth.sessionEnded = true;
    const { container } = render(<AuthScreen />);

    const message = screen.getByText('Your session ended. Sign in again.');
    expect(message.getAttribute('role')).toBe('alert');
    const form = container.querySelector('form');
    if (form === null) {
      throw new Error('the auth form was not rendered');
    }
    expect(form.contains(message)).toBe(false);
    // DOCUMENT_POSITION_FOLLOWING: the form comes after the message.
    expect(
      message.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      message.compareDocumentPosition(
        screen.getByRole('radio', { name: 'Sign in' }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UI-44 shows no session message when the session did not end (first visit or a sign-out)', () => {
    render(<AuthScreen />);

    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UNSPECIFIED keeps the session message after the switch moves to sign-up', () => {
    mocks.auth.sessionEnded = true;
    render(<AuthScreen />);

    fireEvent.click(screen.getByRole('radio', { name: 'Sign up' }));

    expect(screen.getByText('Your session ended. Sign in again.')).toBeTruthy();
  });

  it('UI-44 drops the message once useAuth reports the session no longer ended (the next sign-in)', () => {
    mocks.auth.sessionEnded = true;
    const { rerender } = render(<AuthScreen />);
    expect(screen.getByText('Your session ended. Sign in again.')).toBeTruthy();

    mocks.auth.sessionEnded = false;
    rerender(<AuthScreen />);

    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull();
  });

  it('UI-44 shows a wrong-password error under the form without adding the session message', async () => {
    mocks.signIn.mockRejectedValue(new ApiError(401, 'Wrong username or password'));
    render(<AuthScreen />);

    type('Username', 'rotem');
    type('Password', 'correct-horse');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Wrong username or password')).toBeTruthy();
    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull();
  });
});

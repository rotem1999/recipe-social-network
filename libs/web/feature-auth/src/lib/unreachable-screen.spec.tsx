// SPEC.md §11.5 UI-26: when the start-up `GET /me` fails with status 0 or a
// 5xx, the app shows a full screen "Can't reach CookBook's server." with a
// Retry button that repeats `GET /me`. `@rsn/web/data-access-api` is mocked at
// the module boundary, so no request and no token store is touched.
import { fireEvent, render, screen } from '@testing-library/react';
import { NETWORK_ERROR_MESSAGE } from '@rsn/web/data-access-api';
import { UnreachableScreen } from './unreachable-screen';

const mocks = vi.hoisted(() => ({
  retry: vi.fn(),
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
      user: null,
      status: 'unreachable',
      signIn: mocks.signIn,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      refreshUser: mocks.refreshUser,
      retry: mocks.retry,
    }),
    useTimezone: () => 'Asia/Jerusalem',
  };
});

describe('UnreachableScreen', () => {
  beforeEach(() => {
    mocks.retry.mockReset();
    mocks.signOut.mockReset();
  });

  it("UI-26 says \"Can't reach CookBook's server.\" as an alert", () => {
    render(<UnreachableScreen />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe("Can't reach CookBook's server.");
    expect(NETWORK_ERROR_MESSAGE).toBe("Can't reach CookBook's server.");
  });

  it('UI-26 Retry repeats the start-up GET /me through useAuth().retry', () => {
    render(<UnreachableScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(mocks.retry).toHaveBeenCalledTimes(1);
  });

  it('UI-26 keeps the tokens: the screen offers no sign-in form and never signs out', () => {
    render(<UnreachableScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('UI-2 carries the CookBook brand heading', () => {
    render(<UnreachableScreen />);

    expect(screen.getByRole('heading', { name: 'CookBook' })).toBeTruthy();
  });
});

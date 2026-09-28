import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NavBar } from './nav-bar';
import type { NavBarProps } from './nav-bar';

afterEach(cleanup);

function renderNav(overrides: Partial<NavBarProps> = {}) {
  const props: NavBarProps = {
    active: 'home',
    onNavigate: vi.fn(),
    username: 'rotem',
    onNewRecipe: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<NavBar {...props} />) };
}

describe('NavBar (UI-2)', () => {
  it('UI-2 shows the CookBook brand in the header', () => {
    const { container } = renderNav();

    expect(container.querySelector('.nav-brand')?.textContent).toContain(
      'CookBook',
    );
  });

  it('UI-16 marks the active tab with aria-current="page" and no other tab', () => {
    renderNav({ active: 'discover' });

    expect(
      screen.getByRole('button', { name: 'Discover' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Friends' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('UI-16 calls onNavigate with the tab that was clicked', () => {
    const { props } = renderNav({ active: 'home' });

    fireEvent.click(screen.getByRole('button', { name: 'Friends' }));

    expect(props.onNavigate).toHaveBeenCalledTimes(1);
    expect(props.onNavigate).toHaveBeenCalledWith('friends');
  });

  it('UI-11 calls onNewRecipe when the "New recipe" button is clicked', () => {
    const { props } = renderNav();

    fireEvent.click(screen.getByRole('button', { name: /New recipe/ }));

    expect(props.onNewRecipe).toHaveBeenCalledTimes(1);
  });

  it('UI-9 shows the uppercase first letter of the username on the avatar', () => {
    renderNav({ username: 'rotem' });

    expect(
      screen.getByRole('button', { name: 'Account menu for rotem' }).textContent,
    ).toBe('R');
  });

  it('UI-9 signs out through the avatar menu', () => {
    const { props } = renderNav();
    const avatar = screen.getByRole('button', {
      name: 'Account menu for rotem',
    });

    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(avatar.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(avatar);

    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));

    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('UI-9 closes the avatar menu on Escape without signing out', () => {
    const { props } = renderNav();

    fireEvent.click(
      screen.getByRole('button', { name: 'Account menu for rotem' }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('UI-2 renders the extra controls passed as `right`', () => {
    renderNav({ right: <span data-testid="extra">weather</span> });

    expect(screen.getByTestId('extra').textContent).toBe('weather');
  });
});

import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from './class-names';
import { Button } from './button';
import { Icon } from './icon';

/** UI-16: the three tabs the header switches between; navigation is in-app state, not a URL. */
export type NavTab = 'home' | 'discover' | 'friends';

export interface NavBarProps {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  username: string;
  onNewRecipe: () => void;
  onSignOut: () => void;
  /** Extra controls, placed before the "New recipe" button. */
  right?: ReactNode;
  className?: string;
}

const TABS: readonly { tab: NavTab; label: string }[] = [
  { tab: 'home', label: 'Home' },
  { tab: 'discover', label: 'Discover' },
  { tab: 'friends', label: 'Friends' },
];

/** UI-2/UI-9: the CookBook header — brand, tabs, "New recipe" and the avatar menu. */
export function NavBar({
  active,
  onNavigate,
  username,
  onNewRecipe,
  onSignOut,
  right,
  className,
}: NavBarProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: globalThis.MouseEvent): void => {
      if (
        menuRef.current !== null &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // UI-9: the avatar initial is the first letter of the username.
  const initial = username.slice(0, 1).toUpperCase();

  return (
    <header
      className={cx('nav', className)}
      style={{ maxWidth: '1100px', margin: '0 auto', paddingTop: '22px' }}
    >
      <span
        className="nav-brand"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '9px',
          fontSize: '20px',
        }}
      >
        <span className="nav-mark">
          <Icon.ChefHat size={18} />
        </span>
        CookBook
      </span>

      <nav
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        {TABS.map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            className="nav-link"
            aria-current={tab === active ? 'page' : undefined}
            onClick={() => onNavigate(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {right}

      <Button variant="primary" onClick={onNewRecipe}>
        <Icon.Plus size={15} />
        New recipe
      </Button>

      <span className="nav-menu-anchor" ref={menuRef}>
        <button
          type="button"
          className="nav-avatar"
          title={username}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${username}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {initial}
        </button>
        {menuOpen ? (
          <span className="nav-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <Icon.LogOut size={15} />
              Sign out
            </button>
          </span>
        ) : null}
      </span>
    </header>
  );
}

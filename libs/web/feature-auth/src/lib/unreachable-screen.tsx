// SPEC.md §11.5 UI-26: when `GET /me` fails at start with status 0 or a 5xx,
// the app shows this full screen instead of the sign-in screen; the stored
// tokens are kept and Retry repeats `GET /me`.
import type { ReactElement } from 'react';
import { NETWORK_ERROR_MESSAGE, useAuth } from '@rsn/web/data-access-api';
import { Button, Icon } from '@rsn/web/ui';

/**
 * UI-26: "Can't reach CookBook's server." with a Retry button. Retry goes
 * through `useAuth().retry`, which runs the start-up `GET /me` again.
 */
export function UnreachableScreen(): ReactElement {
  const { retry } = useAuth();

  return (
    <main className="screen screen-narrow">
      <div className="brand mb-6">
        <span className="nav-mark">
          <Icon.ChefHat size={18} />
        </span>
        {/* UI-2: the app is branded CookBook everywhere. */}
        <h1 className="m-0">CookBook</h1>
      </div>
      <p role="alert" className="mb-6">
        {NETWORK_ERROR_MESSAGE}
      </p>
      <Button type="button" variant="primary" onClick={retry}>
        Retry
      </Button>
    </main>
  );
}

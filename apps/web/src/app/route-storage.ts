// SPEC.md §11.5 UI-16: the in-app routes. UI-23: recipe, TheMealDB preview,
// editor and cook routes carry the tab they were opened from. UI-35: the route
// and the cook-mode step are mirrored into sessionStorage (`cookbook.route`)
// and restored when the window reloads with a valid token.
import type { NavTab } from '@rsn/web/ui';

/** UI-35: the sessionStorage key that holds the current route. */
export const ROUTE_STORAGE_KEY = 'cookbook.route';

/** UI-16: navigation is in-app state, never a URL router. */
export type Route =
  | { name: 'home' }
  | { name: 'discover' }
  | { name: 'friends' }
  | { name: 'recipe'; id: string; from: NavTab }
  | { name: 'catalogue'; mealId: string; from: NavTab }
  | { name: 'editor'; id?: string; from?: NavTab }
  | { name: 'cook'; id: string; from: NavTab };

/**
 * UI-35: what is kept in sessionStorage. `userId` ties the route to the user
 * whose valid token restores it, so another account never lands on it.
 */
interface SavedRoute {
  userId: string;
  route: Route;
  /** The cook-mode step (0-based), on a `cook` route only. */
  step?: number;
}

/** What {@link readSavedRoute} hands the shell. */
export interface RestoredRoute {
  route: Route;
  step: number | undefined;
}

const TABS: readonly NavTab[] = ['home', 'discover', 'friends'];

function isTab(value: unknown): value is NavTab {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Rebuilds a {@link Route} from stored JSON; anything malformed is dropped. */
function parseRoute(value: unknown): Route | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  switch (raw['name']) {
    case 'home':
    case 'discover':
    case 'friends':
      return { name: raw['name'] };
    case 'recipe':
      return isId(raw['id']) && isTab(raw['from'])
        ? { name: 'recipe', id: raw['id'], from: raw['from'] }
        : null;
    case 'catalogue':
      return isId(raw['mealId']) && isTab(raw['from'])
        ? { name: 'catalogue', mealId: raw['mealId'], from: raw['from'] }
        : null;
    case 'editor': {
      // UI-35: the route comes back; the editor restores its own unsaved
      // fields from `cookbook.draft` (editor-draft in feature-recipes).
      const id = raw['id'];
      const from = raw['from'];
      if ((id !== undefined && !isId(id)) || (from !== undefined && !isTab(from))) {
        return null;
      }
      return {
        name: 'editor',
        ...(id === undefined ? {} : { id }),
        ...(from === undefined ? {} : { from }),
      };
    }
    case 'cook':
      return isId(raw['id']) && isTab(raw['from'])
        ? { name: 'cook', id: raw['id'], from: raw['from'] }
        : null;
    default:
      return null;
  }
}

/**
 * UI-35: the route saved for `userId`, or null when there is none, it belongs
 * to another user, or sessionStorage is unavailable or holds something else.
 */
export function readSavedRoute(userId: string): RestoredRoute | null {
  let text: string | null;
  try {
    text = globalThis.sessionStorage?.getItem(ROUTE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) {
    return null;
  }
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof saved !== 'object' || saved === null) {
    return null;
  }
  const record = saved as Record<string, unknown>;
  if (record['userId'] !== userId) {
    return null;
  }
  const route = parseRoute(record['route']);
  if (route === null) {
    return null;
  }
  const step = record['step'];
  return {
    route,
    step: route.name === 'cook' && isStep(step) ? step : undefined,
  };
}

/** UI-35: mirrors the route (and the cook step on a cook route) for `userId`. */
export function writeSavedRoute(
  userId: string,
  route: Route,
  step: number | undefined,
): void {
  const saved: SavedRoute = { userId, route };
  if (route.name === 'cook' && step !== undefined) {
    saved.step = step;
  }
  try {
    globalThis.sessionStorage?.setItem(
      ROUTE_STORAGE_KEY,
      JSON.stringify(saved),
    );
  } catch {
    // sessionStorage can be disabled or full; the app then simply starts on
    // Home after a reload, as before UI-35.
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { AuthProvider, useAuth } from '@rsn/web/data-access-api';
import { ConfirmDialog, NavBar } from '@rsn/web/ui';
import type { NavTab } from '@rsn/web/ui';
import type {
  RecipeDetailDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';

import { AuthScreen, UnreachableScreen } from '@rsn/web/feature-auth';
import {
  clearEditorDraft,
  HomeScreen,
  RecipeDetailScreen,
  RecipeEditorScreen,
} from '@rsn/web/feature-recipes';
import {
  CataloguePreviewScreen,
  DiscoverScreen,
} from '@rsn/web/feature-discover';
import { FriendsScreen } from '@rsn/web/feature-friends';
import { CookScreen } from '@rsn/web/feature-cook';
import {
  DiscoverRecommendation,
  HomeRecommendation,
} from '@rsn/web/feature-recommend';

import { readSavedRoute, writeSavedRoute } from './route-storage';
import type { Route } from './route-storage';

export type { Route } from './route-storage';

const HOME: Route = { name: 'home' };
const DISCOVER: Route = { name: 'discover' };
const FRIENDS: Route = { name: 'friends' };

/** UI-16: the route each nav tab leads to. */
const TAB_ROUTES: Readonly<Record<NavTab, Route>> = {
  home: HOME,
  discover: DISCOVER,
  friends: FRIENDS,
};

/** UI-23: the back-button label of each tab a screen can be opened from. */
const BACK_LABELS: Readonly<Record<NavTab, string>> = {
  home: 'Home',
  discover: 'Discover',
  friends: 'Friends',
};

/**
 * UI-16 / UI-23: which nav tab a route belongs to, so the header keeps its
 * highlight on the tab that opened the recipe, preview, editor or cook mode.
 */
function tabOf(route: Route): NavTab {
  switch (route.name) {
    case 'discover':
      return 'discover';
    case 'friends':
      return 'friends';
    case 'recipe':
    case 'catalogue':
    case 'cook':
      return route.from;
    case 'editor':
      return route.from ?? 'home';
    default:
      return 'home';
  }
}

/** UI-16: the routed renderer. Screens own their own `.screen` layout. */
function AppShell(): ReactElement {
  const { status, user, signOut } = useAuth();
  const [route, setRoute] = useState<Route>(HOME);
  const [previous, setPrevious] = useState<Route>(HOME);
  // UI-35: the cook-mode step on a cook route: the restored one after a
  // reload, then whatever cook mode reports; undefined starts at step 1.
  const [cookStep, setCookStep] = useState<number | undefined>(undefined);
  // UI-35: the user whose route the shell holds. When a user is adopted who is
  // not this one (the first `GET /me` after a reload, or another account
  // signing in) the saved route is restored for them, or Home. The same user
  // signing in again after a lost session keeps the route in memory (UI-26).
  const [routeOwner, setRouteOwner] = useState<string | null>(null);
  if (user !== null && user.id !== routeOwner) {
    const restored = readSavedRoute(user.id);
    setRouteOwner(user.id);
    setRoute(restored?.route ?? HOME);
    setPrevious(HOME);
    setCookStep(restored?.step);
  }
  // WX-4: the weather line that belongs under the home greeting (UI-10),
  // reported by the home recommendation card and kept here for HomeScreen.
  const [greetingLine, setGreetingLine] = useState<string | null>(null);

  // The current route, readable from stable callbacks without re-creating them.
  const routeRef = useRef<Route>(route);
  routeRef.current = route;

  // UI-40: the open editor reports whether its fields differ from what it
  // opened with; leaving it by a nav tab, New recipe, Cancel or sign-out then
  // asks "Discard your changes?" first. Saving leaves without asking.
  const [editorVisit, setEditorVisit] = useState(0);
  const editorDirty = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const navigate = useCallback((next: Route): void => {
    setPrevious(routeRef.current);
    setRoute(next);
    setCookStep(undefined);
    // UI-40: every visit to the editor starts a fresh one (new key below).
    setEditorVisit((visit) => visit + 1);
  }, []);

  const reportEditorDirty = useCallback((dirty: boolean): void => {
    editorDirty.current = dirty;
  }, []);
  const guardLeave = useCallback((leave: () => void): void => {
    if (editorDirty.current) {
      setPendingLeave(() => leave);
      return;
    }
    leave();
  }, []);

  // UI-35: mirror the route and the cook step into sessionStorage.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId !== null && userId === routeOwner) {
      writeSavedRoute(userId, route, cookStep);
    }
  }, [userId, routeOwner, route, cookStep]);

  const openTab = useCallback(
    (tab: NavTab): void => {
      guardLeave(() => navigate(TAB_ROUTES[tab]));
    },
    [guardLeave, navigate],
  );

  const openFromHome = useCallback(
    (id: string): void => {
      navigate({ name: 'recipe', id, from: 'home' });
    },
    [navigate],
  );

  const openFromDiscover = useCallback(
    (id: string): void => {
      navigate({ name: 'recipe', id, from: 'discover' });
    },
    [navigate],
  );

  // UI-23: the preview remembers the tab that opened it (Discover today).
  const openCatalogue = useCallback(
    (mealId: string): void => {
      navigate({ name: 'catalogue', mealId, from: 'discover' });
    },
    [navigate],
  );

  // UI-23: cook mode remembers the tab that opened it, so leaving it returns there.
  const cookFromHome = useCallback(
    (id: string): void => {
      navigate({ name: 'cook', id, from: 'home' });
    },
    [navigate],
  );

  const cookFromDiscover = useCallback(
    (id: string): void => {
      navigate({ name: 'cook', id, from: 'discover' });
    },
    [navigate],
  );

  const newRecipe = useCallback((): void => {
    guardLeave(() => navigate({ name: 'editor' }));
  }, [guardLeave, navigate]);

  // UI-40: sign-out from the avatar menu asks first while the editor is dirty.
  const guardedSignOut = useCallback((): void => {
    guardLeave(() => {
      editorDirty.current = false;
      signOut();
    });
  }, [guardLeave, signOut]);

  const handleWeather = useCallback(
    (weather: WeatherContextDto | null): void => {
      setGreetingLine(weather === null ? null : weather.line);
    },
    [],
  );

  // AUTH-8 / UI-9: no decision until the stored token has been checked.
  if (status === 'loading') {
    return (
      <div className="screen screen-narrow" style={{ textAlign: 'center' }}>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  // UI-26: `GET /me` failed at start with status 0 or a 5xx; the tokens are
  // kept and Retry repeats `GET /me`.
  if (status === 'unreachable') {
    return <UnreachableScreen />;
  }

  if (status === 'signed-out' || user === null) {
    return <AuthScreen />;
  }

  let screen: ReactElement;
  switch (route.name) {
    case 'discover':
      screen = (
        <DiscoverScreen
          onOpenRecipe={openFromDiscover}
          onOpenCatalogue={openCatalogue}
          onCook={cookFromDiscover}
          recommendationSlot={
            <DiscoverRecommendation onOpen={openFromDiscover} />
          }
        />
      );
      break;
    case 'friends':
      screen = <FriendsScreen />;
      break;
    case 'recipe': {
      const from = route.from;
      screen = (
        <RecipeDetailScreen
          recipeId={route.id}
          backLabel={BACK_LABELS[from]}
          onBack={() => navigate(TAB_ROUTES[from])}
          onCook={(id: string) => navigate({ name: 'cook', id, from })}
          onEdit={(id: string) => navigate({ name: 'editor', id, from })}
          onDeleted={() => navigate(TAB_ROUTES[from])}
          onOpenRecipe={(id: string) => navigate({ name: 'recipe', id, from })}
        />
      );
      break;
    }
    case 'catalogue': {
      // UI-23: the copy the preview's Save opens, and cook mode started here,
      // go back to the tab that opened the preview.
      const from = route.from;
      screen = (
        <CataloguePreviewScreen
          mealId={route.mealId}
          onBack={() => navigate(TAB_ROUTES[from])}
          onSaved={(id: string) => navigate({ name: 'recipe', id, from })}
          onCook={(id: string) => navigate({ name: 'cook', id, from })}
        />
      );
      break;
    }
    case 'editor': {
      const editing = route.id;
      const from = route.from ?? 'home';
      screen = (
        <RecipeEditorScreen
          key={editorVisit}
          recipeId={editing}
          onSaved={(recipe: RecipeDetailDto) =>
            navigate({ name: 'recipe', id: recipe.id, from })
          }
          onCancel={() =>
            guardLeave(() =>
              navigate(
                editing === undefined
                  ? previous
                  : { name: 'recipe', id: editing, from },
              ),
            )
          }
          onDirtyChange={reportEditorDirty}
        />
      );
      break;
    }
    case 'cook': {
      // COOK-1: cook mode is full screen; the nav bar is hidden below.
      // UI-23: leaving it opens the recipe with the tab that opened cook mode.
      const { id, from } = route;
      // UI-35: `initialStep` and `onStepChange` restore and mirror the step.
      screen = (
        <CookScreen
          key={id}
          recipeId={id}
          onExit={() => navigate({ name: 'recipe', id, from })}
          initialStep={cookStep}
          onStepChange={setCookStep}
        />
      );
      break;
    }
    default:
      screen = (
        <HomeScreen
          onOpenRecipe={openFromHome}
          onCook={cookFromHome}
          greetingLine={greetingLine}
          recommendationSlot={({ hasCandidates }) => (
            // UI-38: Home tells the card whether the caller has anything to rank.
            <HomeRecommendation
              onCook={cookFromHome}
              onOpen={openFromHome}
              onWeather={handleWeather}
              hasCandidates={hasCandidates}
            />
          )}
        />
      );
      break;
  }

  return (
    <>
      {route.name === 'cook' ? null : (
        <NavBar
          active={tabOf(route)}
          onNavigate={openTab}
          username={user.username}
          onNewRecipe={newRecipe}
          onSignOut={guardedSignOut}
        />
      )}
      {screen}
      {pendingLeave === null ? null : (
        <ConfirmDialog
          title="Discard your changes?"
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          onCancel={() => setPendingLeave(null)}
          onConfirm={() => {
            setPendingLeave(null);
            // UI-35: Discard drops the editor's kept draft (cookbook.draft).
            clearEditorDraft();
            pendingLeave();
          }}
        />
      )}
    </>
  );
}

/** UI-16: the renderer root — the auth context wraps every screen. */
export function App(): ReactElement {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;

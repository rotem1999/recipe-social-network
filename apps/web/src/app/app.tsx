import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { AuthProvider, useAuth } from '@rsn/web/data-access-api';
import { NavBar } from '@rsn/web/ui';
import type { NavTab } from '@rsn/web/ui';
import type {
  RecipeDetailDto,
  WeatherContextDto,
} from '@rsn/shared/util-contracts';

import { AuthScreen } from '@rsn/web/feature-auth';
import {
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

/** UI-16: navigation is in-app state, never a URL router. */
export type Route =
  | { name: 'home' }
  | { name: 'discover' }
  | { name: 'friends' }
  | { name: 'recipe'; id: string; from: 'home' | 'discover' }
  | { name: 'catalogue'; mealId: string }
  | { name: 'editor'; id?: string }
  | { name: 'cook'; id: string };

const HOME: Route = { name: 'home' };
const DISCOVER: Route = { name: 'discover' };
const FRIENDS: Route = { name: 'friends' };

/** UI-16: the route each nav tab leads to. */
const TAB_ROUTES: Readonly<Record<NavTab, Route>> = {
  home: HOME,
  discover: DISCOVER,
  friends: FRIENDS,
};

/** UI-16: which nav tab a route belongs to, so the header keeps its highlight. */
function tabOf(route: Route): NavTab {
  switch (route.name) {
    case 'discover':
    case 'catalogue':
      return 'discover';
    case 'friends':
      return 'friends';
    case 'recipe':
      return route.from === 'discover' ? 'discover' : 'home';
    default:
      return 'home';
  }
}

/** UI-16: the routed renderer. Screens own their own `.screen` layout. */
function AppShell(): ReactElement {
  const { status, user, signOut } = useAuth();
  const [route, setRoute] = useState<Route>(HOME);
  const [previous, setPrevious] = useState<Route>(HOME);
  // WX-4: the weather line that belongs under the home greeting (UI-10),
  // reported by the home recommendation card and kept here for HomeScreen.
  const [greetingLine, setGreetingLine] = useState<string | null>(null);

  // The current route, readable from stable callbacks without re-creating them.
  const routeRef = useRef<Route>(route);
  routeRef.current = route;

  const navigate = useCallback((next: Route): void => {
    setPrevious(routeRef.current);
    setRoute(next);
  }, []);

  const openTab = useCallback(
    (tab: NavTab): void => {
      navigate(TAB_ROUTES[tab]);
    },
    [navigate],
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

  const openCatalogue = useCallback(
    (mealId: string): void => {
      navigate({ name: 'catalogue', mealId });
    },
    [navigate],
  );

  const cook = useCallback(
    (id: string): void => {
      navigate({ name: 'cook', id });
    },
    [navigate],
  );

  const newRecipe = useCallback((): void => {
    navigate({ name: 'editor' });
  }, [navigate]);

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
          onCook={cook}
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
          backLabel={from === 'discover' ? 'Discover' : 'Home'}
          onBack={() => navigate(from === 'discover' ? DISCOVER : HOME)}
          onCook={cook}
          onEdit={(id: string) => navigate({ name: 'editor', id })}
          onDeleted={() => navigate(from === 'discover' ? DISCOVER : HOME)}
          onOpenRecipe={from === 'discover' ? openFromDiscover : openFromHome}
        />
      );
      break;
    }
    case 'catalogue':
      screen = (
        <CataloguePreviewScreen
          mealId={route.mealId}
          onBack={() => navigate(DISCOVER)}
          onSaved={openFromHome}
        />
      );
      break;
    case 'editor': {
      const editing = route.id;
      screen = (
        <RecipeEditorScreen
          recipeId={editing}
          onSaved={(recipe: RecipeDetailDto) =>
            navigate({ name: 'recipe', id: recipe.id, from: 'home' })
          }
          onCancel={() =>
            navigate(
              editing === undefined
                ? previous
                : { name: 'recipe', id: editing, from: 'home' },
            )
          }
        />
      );
      break;
    }
    case 'cook':
      // COOK-1: cook mode is full screen; the nav bar is hidden below.
      screen = (
        <CookScreen
          recipeId={route.id}
          onExit={() =>
            navigate({ name: 'recipe', id: route.id, from: 'home' })
          }
        />
      );
      break;
    default:
      screen = (
        <HomeScreen
          onOpenRecipe={openFromHome}
          onCook={cook}
          greetingLine={greetingLine}
          recommendationSlot={
            <HomeRecommendation
              onCook={cook}
              onOpen={openFromHome}
              onWeather={handleWeather}
            />
          }
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
          onSignOut={signOut}
        />
      )}
      {screen}
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

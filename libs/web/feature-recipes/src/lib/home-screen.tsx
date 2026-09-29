// SPEC.md SAVE-3 and the design guide §2: the Home tab — greeting, the weather
// line, the recommendation strip the shell passes in, and the grid of the
// caller's own, saved and shared recipes from `GET /recipes` (§11.6).
import type { ReactElement, ReactNode } from 'react';
import { greetingFor } from '@rsn/shared/util-domain';
import { useApi, useAuth, useRequest } from '@rsn/web/data-access-api';
import { Button, EmptyState, Icon, InlineError } from '@rsn/web/ui';
import { RecipeCard } from './recipe-card';

/** What Home knows that the recommendation card needs (UI-38). */
export interface HomeRecommendationContext {
  /**
   * WX-10: whether the caller has any own or saved recipe to rank; null until
   * `GET /recipes` succeeded.
   */
  hasCandidates: boolean | null;
}

export interface HomeScreenProps {
  onOpenRecipe: (id: string) => void;
  onCook: (id: string) => void;
  /**
   * The recommendation card from `@rsn/web/feature-recommend` (WX-4). As a
   * function it receives what Home knows about the caller's recipes (UI-38).
   */
  recommendationSlot?:
    | ReactNode
    | ((context: HomeRecommendationContext) => ReactNode);
  /** WX-8 weather line; null before it arrives or when the API has none. */
  greetingLine?: string | null;
}

/** SAVE-3: the caption beside "Your recipes". */
function countLabel(count: number): string {
  return count === 1 ? '1 recipe' : `${count} recipes`;
}

/** The guide's Home screen; the shell mounts it for the `home` route (UI-16). */
export function HomeScreen({
  onOpenRecipe,
  onCook,
  recommendationSlot,
  greetingLine,
}: HomeScreenProps): ReactElement {
  const api = useApi();
  const { user } = useAuth();
  const { data, error, loading, reload } = useRequest(
    () => api.listRecipes(),
    [],
  );

  // UI-10: the greeting reads the viewer's own clock, like the recommendation does.
  const greeting = `${greetingFor(new Date().getHours())}, ${user?.username ?? ''}`;
  // UI-26: a count, an empty state or cards only after the request succeeded.
  const succeeded = !loading && error === null && data !== null;
  const recipes = succeeded ? data.recipes : [];
  // UI-38 + WX-10: Home ranks the caller's own and saved recipes only.
  const hasCandidates = succeeded
    ? recipes.some(
        (recipe) => recipe.relation === 'own' || recipe.relation === 'saved',
      )
    : null;
  const hasLine =
    greetingLine !== undefined && greetingLine !== null && greetingLine !== '';

  return (
    <main className="screen" aria-label="Home">
      <h1 className={hasLine ? 'mb-1' : 'mb-6'}>{greeting}</h1>
      {/* UI-38: no sub-line until the WX-10 weather line arrives. */}
      {hasLine ? <p className="text-muted page-lead">{greetingLine}</p> : null}

      {typeof recommendationSlot === 'function'
        ? recommendationSlot({ hasCandidates })
        : recommendationSlot}

      <div className="row align-baseline gap-3 mt-8 mb-4">
        <h4 className="m-0">Your recipes</h4>
        <span className="text-muted text-small">
          {loading ? 'Loading…' : succeeded ? countLabel(recipes.length) : null}
        </span>
      </div>

      {/* UI-26: after a failure, the message and a way to ask again. */}
      {!loading && error !== null ? (
        <div className="row gap-3 wrap">
          <InlineError>{error.message}</InlineError>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : null}

      {succeeded && recipes.length === 0 ? (
        <EmptyState text="No recipes yet. Create one, or save a public recipe from Discover." />
      ) : null}

      {/* UI-36: grid rows align cards to the top. */}
      <div className="card-grid card-grid-narrow">
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onOpen={onOpenRecipe}
            actionSlot={
              // SAVE-2: everything on Home is owned, saved or shared, so it is cookable.
              <Button
                variant="ghost"
                className="btn-sm"
                onClick={() => onCook(recipe.id)}
              >
                <Icon.Play size={13} />
                Cook
              </Button>
            }
          />
        ))}
      </div>
    </main>
  );
}

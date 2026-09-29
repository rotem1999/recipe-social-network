// SPEC.md SAVE-3 and the design guide §2: the Home tab — greeting, the weather
// line, the recommendation strip the shell passes in, and the grid of the
// caller's own, saved and shared recipes from `GET /recipes` (§11.6).
import type { ReactElement, ReactNode } from 'react';
import { greetingFor } from '@rsn/shared/util-domain';
import { useApi, useAuth, useRequest } from '@rsn/web/data-access-api';
import { Button, EmptyState, Icon, InlineError } from '@rsn/web/ui';
import { RecipeCard } from './recipe-card';

export interface HomeScreenProps {
  onOpenRecipe: (id: string) => void;
  onCook: (id: string) => void;
  /** The recommendation card from `@rsn/web/feature-recommend` (WX-4). */
  recommendationSlot?: ReactNode;
  /** WX-8 weather line; null before it arrives or when the API has none. */
  greetingLine?: string | null;
}

/** Shown under the greeting until the weather line arrives (decided, not in SPEC). */
const FALLBACK_LINE = 'Your recipes, ready when you are.';

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
  const { data, error, loading } = useRequest(() => api.listRecipes(), []);

  // UI-10: the greeting reads the viewer's own clock, like the recommendation does.
  const greeting = `${greetingFor(new Date().getHours())}, ${user?.username ?? ''}`;
  const recipes = data?.recipes ?? [];

  return (
    <main className="screen" aria-label="Home">
      <h1 style={{ marginBottom: 'var(--space-1)' }}>{greeting}</h1>
      <p
        className="text-muted"
        style={{ fontSize: '14px', marginBottom: 'var(--space-6)' }}
      >
        {greetingLine ?? FALLBACK_LINE}
      </p>

      {recommendationSlot}

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-3)',
          margin: 'var(--space-8) 0 var(--space-4)',
        }}
      >
        <h4 style={{ margin: 0 }}>Your recipes</h4>
        <span className="text-muted" style={{ fontSize: '12px' }}>
          {loading ? 'Loading…' : countLabel(recipes.length)}
        </span>
      </div>

      {error === null ? null : <InlineError>{error.message}</InlineError>}

      {!loading && error === null && recipes.length === 0 ? (
        <EmptyState text="No recipes yet. Create one, or save a public recipe from Discover." />
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onOpen={onOpenRecipe}
            actionSlot={
              // SAVE-2: everything on Home is owned, saved or shared, so it is cookable.
              <Button
                variant="ghost"
                style={{ fontSize: '12px', paddingBlock: 'var(--space-1)' }}
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

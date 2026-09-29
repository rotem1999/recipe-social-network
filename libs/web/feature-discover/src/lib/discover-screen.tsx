// SPEC.md §5 (DISC-1..DISC-10), §3.2 SAVE-1/2/10, §3.3 CAT-2/CAT-7, §11.5
// (guide §3, UI-14). The Discover tab: the category chip row, the split view of
// GET /discover, the filtered view with Load more, the optimistic Save action, the
// "In your recipes" + Cook state of items the caller already has a copy of, and
// the TheMealDB attribution footer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type {
  DiscoverCategoryDto,
  RecipeCardDto,
} from '@rsn/shared/util-contracts';
import type { Category } from '@rsn/shared/util-domain';
import { MAX_FAVOURITE_CATEGORIES } from '@rsn/shared/util-domain';
import { useApi, useAuth, useRequest } from '@rsn/web/data-access-api';
import { RecipeCard } from '@rsn/web/feature-recipes';
import { Button, EmptyState, Icon, InlineError, Tag } from '@rsn/web/ui';
import { CatalogueTile } from './catalogue-tile';
import { CategoryChips } from './category-chips';
import { errorMessage } from './error-message';

export interface DiscoverScreenProps {
  onOpenRecipe(id: string): void;
  onOpenCatalogue(mealId: string): void;
  onCook(id: string): void;
  /** DISC-3: the weather recommendation card, rendered above the grid. */
  recommendationSlot?: ReactNode;
}

/** SAVE-1: what happened to the Save button of one Discover card. */
type SaveState =
  | { status: 'saving' }
  | { status: 'saved'; savedId: string }
  | { status: 'error'; message: string };

const GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 'var(--space-4)',
};

const SECTION_HEADER: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  marginBottom: 'var(--space-3)',
};

/** Merges the pages loaded after the first one into a single category entry (DISC-9). */
function mergePages(
  first: DiscoverCategoryDto,
  extra: DiscoverCategoryDto[],
): DiscoverCategoryDto {
  const last = extra.length > 0 ? extra[extra.length - 1] : first;
  return {
    ...first,
    recipes: [...first.recipes, ...extra.flatMap((page) => page.recipes)],
    catalogue: [...first.catalogue, ...extra.flatMap((page) => page.catalogue)],
    page: last.page,
    hasMore: last.hasMore,
  };
}

export function DiscoverScreen({
  onOpenRecipe,
  onOpenCatalogue,
  onCook,
  recommendationSlot,
}: DiscoverScreenProps): ReactElement {
  const api = useApi();
  const { user, refreshUser } = useAuth();

  // DISC-9: null is the split view, a category is the filtered view.
  const [category, setCategory] = useState<Category | null>(null);
  const [extraPages, setExtraPages] = useState<DiscoverCategoryDto[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // DISC-6: the favourites of the signed-in user, kept locally so the chips react
  // at once and fall back to the stored list when the write fails.
  const [favourites, setFavourites] = useState<Category[]>(
    () => user?.favouriteCategories ?? [],
  );
  const [favouriteMessage, setFavouriteMessage] = useState<string | null>(null);
  const [savingFavourites, setSavingFavourites] = useState(false);

  const [saves, setSaves] = useState<Record<string, SaveState>>({});

  const feed = useRequest(
    () => api.discover(category ?? undefined),
    [category],
  );
  const reload = feed.reload;

  useEffect(() => {
    setFavourites(user?.favouriteCategories ?? []);
  }, [user]);

  useEffect(() => {
    setExtraPages([]);
    setPageError(null);
  }, [category]);

  // DISC-6: toggle, with the inline message of UI-6 when the third is already pinned.
  const toggleFavourite = useCallback(
    async (target: Category): Promise<void> => {
      const isFavourite = favourites.includes(target);
      if (!isFavourite && favourites.length >= MAX_FAVOURITE_CATEGORIES) {
        setFavouriteMessage(
          `You can pin up to ${MAX_FAVOURITE_CATEGORIES} favourite categories.`,
        );
        return;
      }
      const previous = favourites;
      const next = isFavourite
        ? favourites.filter((one) => one !== target)
        : [...favourites, target];
      setFavourites(next);
      setFavouriteMessage(null);
      setSavingFavourites(true);
      try {
        const updated = await api.setFavouriteCategories({ categories: next });
        setFavourites(updated.favouriteCategories);
        // Keeps the signed-in user in step and re-orders the split view (DISC-9).
        await refreshUser();
        reload();
      } catch (cause) {
        setFavourites(previous);
        setFavouriteMessage(
          errorMessage(cause, 'Could not change your favourites.'),
        );
      } finally {
        setSavingFavourites(false);
      }
    },
    [api, favourites, refreshUser, reload],
  );

  // SAVE-1 + UI-14: optimistic; on failure the button returns to Save with a message.
  const save = useCallback(
    async (recipe: RecipeCardDto): Promise<void> => {
      setSaves((current) => ({
        ...current,
        [recipe.id]: { status: 'saving' },
      }));
      try {
        const copy = await api.saveRecipe(recipe.id);
        setSaves((current) => ({
          ...current,
          [recipe.id]: { status: 'saved', savedId: copy.id },
        }));
      } catch (cause) {
        setSaves((current) => ({
          ...current,
          [recipe.id]: {
            status: 'error',
            message: errorMessage(cause, 'Could not save this recipe.'),
          },
        }));
      }
    },
    [api],
  );

  const filtered = useMemo<DiscoverCategoryDto | null>(() => {
    if (category === null) {
      return null;
    }
    const first = feed.data?.categories[0];
    return first === undefined ? null : mergePages(first, extraPages);
  }, [category, feed.data, extraPages]);

  // DISC-9: the next page of the filtered category, appended to what is shown.
  const loadMore = useCallback(async (): Promise<void> => {
    if (category === null || filtered === null) {
      return;
    }
    setLoadingMore(true);
    setPageError(null);
    try {
      const next = await api.discover(category, filtered.page + 1);
      const entry = next.categories[0];
      if (entry !== undefined) {
        setExtraPages((current) => [...current, entry]);
      }
    } catch (cause) {
      setPageError(errorMessage(cause, 'Could not load more recipes.'));
    } finally {
      setLoadingMore(false);
    }
  }, [api, category, filtered]);

  /**
   * SAVE-2 / DISC-10 / UI-14: the card action. Save downloads the public recipe
   * (SAVE-1); once saved, or when GET /discover already carries the caller's copy
   * (`myCopyId`), the card shows "In your recipes" and the ghost Cook button of the
   * guide, pointed at the copy — cook mode never runs on the public original.
   */
  const actionSlot = (recipe: RecipeCardDto): ReactNode => {
    const state = saves[recipe.id];
    const copyId = state?.status === 'saved' ? state.savedId : recipe.myCopyId;
    let action: ReactNode;
    if (copyId !== null && state?.status !== 'saving') {
      action = (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <Tag tone="neutral">In your recipes</Tag>
          {/* SAVE-10: the caller's copy is behind this recipe. */}
          {recipe.updateAvailable ? (
            <Tag tone="accent">Update available</Tag>
          ) : null}
          <Button variant="ghost" onClick={() => onCook(copyId)}>
            <Icon.Play size={13} />
            Cook
          </Button>
        </span>
      );
    } else if (state?.status === 'saving') {
      action = (
        <Button variant="ghost" disabled>
          <Icon.Play size={13} />
          Cook
        </Button>
      );
    } else if (recipe.relation === 'own') {
      action = (
        <Button variant="ghost" onClick={() => onCook(recipe.id)}>
          <Icon.Play size={13} />
          Cook
        </Button>
      );
    } else if (recipe.relation === 'saved' || recipe.relation === 'shared') {
      // SAVE-3: a recipe shared with the caller is already listed on their Home.
      action = <Tag tone="neutral">In your recipes</Tag>;
    } else {
      action = (
        <Button variant="secondary" onClick={() => save(recipe)}>
          <Icon.Download size={13} />
          Save
        </Button>
      );
    }

    // RecipeCard renders the "by <owner>" byline itself (UI-10); the slot carries
    // only the action and, on a failed save, the inline message of UI-14.
    return (
      <span
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
        }}
      >
        {action}
        {state?.status === 'error' ? (
          <InlineError>{state.message}</InlineError>
        ) : null}
      </span>
    );
  };

  const cards = (entry: DiscoverCategoryDto): ReactElement => (
    <div style={GRID}>
      {/* DISC-1/DISC-2: public user recipes first. */}
      {entry.recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          onOpen={onOpenRecipe}
          showStars
          actionSlot={actionSlot(recipe)}
        />
      ))}
      {/* DISC-4 / CAT-2: then the TheMealDB entries of the same category. */}
      {entry.catalogue.map((item) => (
        <CatalogueTile
          key={item.mealId}
          item={item}
          onOpen={onOpenCatalogue}
          onCook={onCook}
        />
      ))}
    </div>
  );

  const sections = feed.data?.categories.filter(
    (entry) => entry.recipes.length > 0 || entry.catalogue.length > 0,
  );

  return (
    <main className="screen">
      <h1 style={{ marginBottom: 'var(--space-1)' }}>Discover</h1>
      <p
        className="text-muted"
        style={{ fontSize: '14px', marginBottom: 'var(--space-6)' }}
      >
        Public recipes from the network and TheMealDB catalogue.
      </p>

      <CategoryChips
        favourites={favourites}
        selected={category}
        busy={savingFavourites}
        onSelect={setCategory}
        onToggleFavourite={toggleFavourite}
      />
      {favouriteMessage === null ? null : (
        <InlineError>{favouriteMessage}</InlineError>
      )}

      {/* DISC-3: the weather- and time-based advice sits above the grid. */}
      {recommendationSlot === undefined ? null : (
        <div style={{ margin: 'var(--space-6) 0' }}>{recommendationSlot}</div>
      )}

      <div style={{ marginTop: 'var(--space-6)' }}>
        {feed.loading ? (
          <p className="text-muted">Loading…</p>
        ) : feed.error !== null ? (
          <div>
            <InlineError>
              {errorMessage(feed.error, 'Could not load Discover.')}
            </InlineError>
            <Button
              variant="ghost"
              onClick={reload}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Try again
            </Button>
          </div>
        ) : filtered !== null ? (
          <>
            {filtered.recipes.length === 0 &&
            filtered.catalogue.length === 0 ? (
              <EmptyState text={`Nothing in ${filtered.category} yet.`} />
            ) : (
              cards(filtered)
            )}
            {pageError === null ? null : <InlineError>{pageError}</InlineError>}
            {filtered.hasMore ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: 'var(--space-6)',
                }}
              >
                <Button
                  variant="secondary"
                  loading={loadingMore}
                  onClick={loadMore}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        ) : sections === undefined || sections.length === 0 ? (
          <EmptyState text="Nothing has been published yet." />
        ) : (
          // DISC-5: the split view, favourites first (DISC-9 orders the response).
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-8)',
            }}
          >
            {sections.map((entry) => (
              <section key={entry.category}>
                <div style={SECTION_HEADER}>
                  <h3
                    style={{
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {entry.category}
                    {entry.isFavourite ? (
                      <Tag tone="accent">Favourite</Tag>
                    ) : null}
                  </h3>
                  <Button
                    variant="ghost"
                    onClick={() => setCategory(entry.category)}
                  >
                    See all
                  </Button>
                </div>
                {cards(entry)}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* §3.3 / UI-7: the attribution string the API returns, shown with its URL. */}
      {feed.data === null ? null : (
        <p
          className="text-muted"
          style={{ fontSize: '11px', marginTop: 'var(--space-8)' }}
        >
          {feed.data.attribution}
        </p>
      )}
    </main>
  );
}

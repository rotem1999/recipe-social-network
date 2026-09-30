// SPEC.md §5 (DISC-1..DISC-10), §3.2 SAVE-1/2/10, §3.3 CAT-2/CAT-7, §11.5
// (guide §3, UI-14, UI-21, UI-26, UI-33, UI-36, UI-38). The Discover tab: the
// category chip row, the split view of GET /discover, the filtered view with Load
// more, the optimistic Save action of public recipes, the non-optimistic Save of
// TheMealDB tiles, the "In your recipes" + Cook state of items the caller already
// has a copy of, and the TheMealDB attribution footer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type {
  CatalogueItemDto,
  DiscoverCategoryDto,
  RecipeCardDto,
} from '@rsn/shared/util-contracts';
import type { Category } from '@rsn/shared/util-domain';
import { CATEGORIES, MAX_FAVOURITE_CATEGORIES } from '@rsn/shared/util-domain';
import { useApi, useAuth, useRequest } from '@rsn/web/data-access-api';
import { RecipeCard } from '@rsn/web/feature-recipes';
import { Button, EmptyState, Icon, InlineError, Tag } from '@rsn/web/ui';
import { CatalogueTile } from './catalogue-tile';
import type { CatalogueSaveState } from './catalogue-tile';
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

/**
 * UI-33 / DISC-9: the sections already on screen in the response's order — the
 * favourites first, in the order they are stored, then the rest in DISC-7 order.
 */
function orderSections(
  categories: DiscoverCategoryDto[],
  favourites: Category[],
): DiscoverCategoryDto[] {
  const byCategory = new Map(categories.map((entry) => [entry.category, entry]));
  const ordered: Category[] = [
    ...favourites,
    ...CATEGORIES.filter((entry) => !favourites.includes(entry)),
  ];
  return ordered.flatMap((entry) => {
    const section = byCategory.get(entry);
    return section === undefined
      ? []
      : [{ ...section, isFavourite: favourites.includes(entry) }];
  });
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
  // UI-21: the Save of each TheMealDB tile, by meal id.
  const [catalogueSaves, setCatalogueSaves] = useState<
    Record<string, CatalogueSaveState>
  >({});

  const feed = useRequest(
    () => api.discover(category ?? undefined),
    [category],
  );
  const reload = feed.reload;
  const setFeed = feed.setData;

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
        // UI-33: re-orders the sections already loaded; no refetch, no blank grid.
        setFeed((current) =>
          current === null
            ? current
            : {
                ...current,
                categories: orderSections(
                  current.categories,
                  updated.favouriteCategories,
                ),
              },
        );
        // Keeps the signed-in user in step (DISC-6).
        void refreshUser();
      } catch (cause) {
        setFavourites(previous);
        setFavouriteMessage(
          errorMessage(cause, 'Could not change your favourites.'),
        );
      } finally {
        setSavingFavourites(false);
      }
    },
    [api, favourites, refreshUser, setFeed],
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

  // UI-21: not optimistic; the tile spins until the copy exists, then shows Cook.
  const saveCatalogue = useCallback(
    async (item: CatalogueItemDto): Promise<void> => {
      setCatalogueSaves((current) => ({
        ...current,
        [item.mealId]: { status: 'saving' },
      }));
      try {
        const copy = await api.saveCatalogue(item.mealId);
        setCatalogueSaves((current) => ({
          ...current,
          [item.mealId]: { status: 'saved', savedId: copy.id },
        }));
      } catch (cause) {
        setCatalogueSaves((current) => ({
          ...current,
          [item.mealId]: {
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
        <span className="row-inline wrap justify-end">
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
      <span className="card-action">
        {action}
        {state?.status === 'error' ? (
          <InlineError>{state.message}</InlineError>
        ) : null}
      </span>
    );
  };

  // Every grid on Discover belongs to one category (a split-view section or the
  // filtered view), so its cards carry no category tag (UI-38).
  const cards = (entry: DiscoverCategoryDto): ReactElement => (
    <>
      {/* UI-38: a category without public recipes says so above its TheMealDB tiles. */}
      {entry.recipes.length === 0 && entry.catalogue.length > 0 ? (
        <p className="text-muted text-body">
          No community recipes in this category yet
        </p>
      ) : null}
      {/* UI-36: cards of different heights align to the top of their row. */}
      <div className="card-grid">
        {/* DISC-1/DISC-2: public user recipes first. */}
        {entry.recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onOpen={onOpenRecipe}
            showStars
            showCategory={false}
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
            onSave={saveCatalogue}
            saveState={catalogueSaves[item.mealId]}
            showCategory={false}
          />
        ))}
      </div>
    </>
  );

  const sections = feed.data?.categories.filter(
    (entry) => entry.recipes.length > 0 || entry.catalogue.length > 0,
  );

  return (
    <main className="screen">
      <h1 className="page-title">Discover</h1>
      <p className="text-muted page-lead">
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
        <div className="mt-6 mb-6">{recommendationSlot}</div>
      )}

      <div className="mt-6">
        {feed.loading ? (
          <p className="text-muted">Loading…</p>
        ) : feed.error !== null ? (
          <div>
            <InlineError>
              {errorMessage(feed.error, 'Could not load Discover.')}
            </InlineError>
            <Button variant="ghost" onClick={reload} className="mt-2">
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
              <div className="load-more">
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
          <div className="stack gap-8">
            {sections.map((entry) => (
              <section key={entry.category}>
                <div className="section-header">
                  <h3 className="row m-0">
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
        <p className="text-muted text-caption mt-8">
          {feed.data.attribution}
        </p>
      )}
    </main>
  );
}

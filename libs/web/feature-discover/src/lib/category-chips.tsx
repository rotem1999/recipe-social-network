// DISC-5/6/7 + §11.5 (guide §3): the chip row of the 14 categories. Favourites are
// pinned first in a tinted accent-100 pill with a filled star; the active chip is
// solid accent. Colours come from the tokens only (UI-3).
import type { ReactElement } from 'react';
import type { Category } from '@rsn/shared/util-domain';
import { CATEGORIES } from '@rsn/shared/util-domain';
import { cx } from '@rsn/web/ui';

export interface CategoryChipsProps {
  /** DISC-6: at most MAX_FAVOURITE_CATEGORIES, pinned first. */
  favourites: Category[];
  /** DISC-9: the filtered category, or null for the split view. */
  selected: Category | null;
  /** Blocks the star while `PUT /me/favourite-categories` is in flight. */
  busy?: boolean;
  onSelect(category: Category | null): void;
  onToggleFavourite(category: Category): void;
}

/** DISC-6: favourites first, the rest in the DISC-7 order. */
function order(favourites: Category[]): Category[] {
  const pinned = CATEGORIES.filter((category) => favourites.includes(category));
  const rest = CATEGORIES.filter((category) => !favourites.includes(category));
  return [...pinned, ...rest];
}

/** §11.5 guide §3: one pill per category, with the favourite star inside it. */
export function CategoryChips({
  favourites,
  selected,
  busy = false,
  onSelect,
  onToggleFavourite,
}: CategoryChipsProps): ReactElement {
  return (
    <div className="tag-row" role="group" aria-label="Categories">
      {order(favourites).map((category) => {
        const isFavourite = favourites.includes(category);
        const isActive = selected === category;
        return (
          <span
            key={category}
            className={cx(
              'chip',
              isFavourite && 'is-favourite',
              isActive && 'is-active',
            )}
          >
            {/* DISC-6: pin or unpin, without selecting the chip. */}
            <button
              type="button"
              disabled={busy}
              title={
                isFavourite
                  ? 'Unpin this favourite'
                  : 'Pin as a favourite (up to 3)'
              }
              aria-label={
                isFavourite
                  ? `Unpin ${category} from favourites`
                  : `Pin ${category} as a favourite`
              }
              aria-pressed={isFavourite}
              onClick={() => onToggleFavourite(category)}
              className="chip-star"
            >
              {isFavourite ? '★' : '☆'}
            </button>
            {/* DISC-9: selecting a chip filters; selecting it again clears the filter. */}
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(isActive ? null : category)}
              className="chip-label"
            >
              {category}
            </button>
          </span>
        );
      })}
    </div>
  );
}

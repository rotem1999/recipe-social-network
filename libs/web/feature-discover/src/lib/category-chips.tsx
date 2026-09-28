// DISC-5/6/7 + §11.5 (guide §3): the chip row of the 14 categories. Favourites are
// pinned first in a tinted accent-100 pill with a filled star; the active chip is
// solid accent. Colours come from the tokens only (UI-3).
import type { CSSProperties, ReactElement } from 'react';
import type { Category } from '@rsn/shared/util-domain';
import { CATEGORIES } from '@rsn/shared/util-domain';

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

const ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
};

const STAR: CSSProperties = {
  border: 0,
  background: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  lineHeight: 1,
  fontFamily: 'inherit',
  fontSize: '12px',
};

const LABEL: CSSProperties = {
  border: 0,
  background: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: '13px',
  lineHeight: 1.2,
};

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
    <div style={ROW} role="group" aria-label="Categories">
      {order(favourites).map((category) => {
        const isFavourite = favourites.includes(category);
        const isActive = selected === category;
        return (
          <span
            key={category}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 13px',
              borderRadius: '999px',
              transition: 'background 0.15s ease',
              border: `1px solid ${
                isActive ? 'var(--color-accent)' : 'var(--color-divider)'
              }`,
              background: isActive
                ? 'var(--color-accent)'
                : isFavourite
                  ? 'var(--color-accent-100)'
                  : 'transparent',
              color: isActive
                ? 'var(--color-bg)'
                : isFavourite
                  ? 'var(--color-accent-800)'
                  : 'var(--color-text)',
            }}
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
              style={{
                ...STAR,
                opacity: isFavourite ? 1 : 0.6,
                color: isActive
                  ? 'var(--color-bg)'
                  : isFavourite
                    ? 'var(--color-accent)'
                    : 'var(--color-neutral-500)',
              }}
            >
              {isFavourite ? '★' : '☆'}
            </button>
            {/* DISC-9: selecting a chip filters; selecting it again clears the filter. */}
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(isActive ? null : category)}
              style={LABEL}
            >
              {category}
            </button>
          </span>
        );
      })}
    </div>
  );
}

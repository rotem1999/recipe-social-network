// SPEC.md §11.5 UI-10/UI-13/UI-36/UI-38, SAVE-10 and the design guide §2: the
// recipe card shown on Home, in Discover and in the recommendation strip.
// Presentational only — the screen that renders it owns the data (libs/web/CLAUDE.md).
import type { ReactElement, ReactNode } from 'react';
import type { RecipeCardDto } from '@rsn/shared/util-contracts';
import { totalMinutes } from '@rsn/shared/util-domain';
import { StarAverage, Tag, WashedImage } from '@rsn/web/ui';

export interface RecipeCardProps {
  recipe: RecipeCardDto;
  onOpen: (id: string) => void;
  /** Right-aligned action (Discover's Save / Cook); a click there never opens the card. */
  actionSlot?: ReactNode;
  /** UI-13: private and shared recipes carry no rating, so the row is dropped. */
  showStars?: boolean;
  /** UI-38: cards inside a Discover category section carry no category tag. */
  showCategory?: boolean;
}

/** UI-10: "40 min · serves 2"; the minutes half is dropped when both are absent. */
function metaLine(recipe: RecipeCardDto): string {
  const minutes = totalMinutes(recipe);
  const serves = `serves ${recipe.servings}`;
  return minutes === undefined ? serves : `${minutes} min · ${serves}`;
}

/**
 * The guide's card: washed image, title, category tag, star row and meta line.
 * UI-10 also puts the owner's username on recipes that are not the viewer's own
 * copy (Discover's "by Noa"); own and saved copies belong to the viewer already.
 */
export function RecipeCard({
  recipe,
  onOpen,
  actionSlot,
  showStars = true,
  showCategory = true,
}: RecipeCardProps): ReactElement {
  const isMine = recipe.relation === 'own' || recipe.relation === 'saved';
  const byline = isMine ? null : `by ${recipe.ownerUsername}`;
  // SAVE-10: the caller's copy is behind its source (the Home card's tag).
  const showUpdate = isMine && recipe.updateAvailable;

  // UI-36: an `article` whose title button opens the recipe; the button's click
  // area covers the card, and the action slot sits above it, so no button is
  // nested in another and a click on an action never opens the card.
  return (
    <article className="card elev-sm card-interactive card-flush card-stretch">
      <WashedImage src={recipe.imageUrl} alt={recipe.title} seed={recipe.id} />
      <div className="card-content">
        {/* UI-36: the category tag sits on its own line above the title. */}
        {showCategory ? (
          <div>
            <Tag tone="neutral">{recipe.category}</Tag>
          </div>
        ) : null}
        {/* UI-36: the title is a real button; `.plain-button` keeps the `.card-title` look. */}
        <button
          type="button"
          className="card-title plain-button"
          title={recipe.title}
          onClick={() => onOpen(recipe.id)}
        >
          {/* UI-41: the title is user text, so it carries dir="auto".
              UI-36: clamped to two lines; the full title is in `title`.
              UI-50: the clamp and ellipsis follow the text; the card stays left-aligned. */}
          <span dir="auto" className="card-clamp bidi-text">
            {recipe.title}
          </span>
          {/* UI-36: stretches the title button's click area over the whole card. */}
          <span aria-hidden="true" className="card-stretch-area" />
        </button>
        {showStars && recipe.rating !== null ? (
          <StarAverage
            average={recipe.rating.average}
            count={recipe.rating.count}
          />
        ) : null}
        <div className="card-meta">{metaLine(recipe)}</div>
        {showUpdate ? (
          <div>
            <Tag tone="accent">Update available</Tag>
          </div>
        ) : null}
        {byline === null && actionSlot === undefined ? null : (
          <div className="card-meta card-meta-split">
            <span>{byline}</span>
            {actionSlot === undefined ? null : (
              <span className="card-above">{actionSlot}</span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

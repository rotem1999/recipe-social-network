// SPEC.md §11.5 UI-10/UI-13, SAVE-10 and the design guide §2: the recipe card
// shown on Home, in Discover and in the recommendation strip. Presentational only —
// the screen that renders it owns the data (libs/web/CLAUDE.md).
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode } from 'react';
import type { RecipeCardDto } from '@rsn/shared/util-contracts';
import { totalMinutes } from '@rsn/shared/util-domain';
import { Card, StarAverage, Tag, WashedImage } from '@rsn/web/ui';

export interface RecipeCardProps {
  recipe: RecipeCardDto;
  onOpen: (id: string) => void;
  /** Right-aligned action (Discover's Save / Cook); a click there never opens the card. */
  actionSlot?: ReactNode;
  /** UI-13: private and shared recipes carry no rating, so the row is dropped. */
  showStars?: boolean;
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
}: RecipeCardProps): ReactElement {
  const isMine = recipe.relation === 'own' || recipe.relation === 'saved';
  const byline = isMine ? null : `by ${recipe.ownerUsername}`;
  // SAVE-10: the caller's copy is behind its source (the Home card's tag).
  const showUpdate = isMine && recipe.updateAvailable;
  const open = (): void => onOpen(recipe.id);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  // The action slot holds its own buttons; their clicks must not open the card.
  const stop = (event: MouseEvent<HTMLSpanElement>): void =>
    event.stopPropagation();

  return (
    <Card
      flush
      interactive
      role="button"
      tabIndex={0}
      aria-label={recipe.title}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <WashedImage src={recipe.imageUrl} alt={recipe.title} seed={recipe.id} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          padding: 'var(--space-3) var(--space-4) var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <span className="card-title">{recipe.title}</span>
          <Tag tone="neutral" style={{ flex: 'none' }}>
            {recipe.category}
          </Tag>
        </div>
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
          <div
            className="card-meta"
            style={{ justifyContent: 'space-between' }}
          >
            <span>{byline}</span>
            {actionSlot === undefined ? null : (
              <span onClick={stop}>{actionSlot}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

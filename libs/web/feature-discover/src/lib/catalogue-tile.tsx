// DISC-4 / CAT-2 / DISC-10: a TheMealDB entry in the Discover grid. It opens the
// catalogue preview, which is the only place it can be saved (CAT-3); once the
// caller has a copy (CAT-7, `myCopyId`) it shows "In your recipes" and a Cook button.
import type { KeyboardEvent, MouseEvent, ReactElement } from 'react';
import type { CatalogueItemDto } from '@rsn/shared/util-contracts';
import { Button, Card, Icon, Tag, WashedImage } from '@rsn/web/ui';

export interface CatalogueTileProps {
  item: CatalogueItemDto;
  onOpen(mealId: string): void;
  /** DISC-10: opens cook mode on the caller's copy of this meal. */
  onCook(recipeId: string): void;
}

/** §11.5 guide §3: the card of the Discover grid, with the "TheMealDB" byline. */
export function CatalogueTile({
  item,
  onOpen,
  onCook,
}: CatalogueTileProps): ReactElement {
  const open = (): void => onOpen(item.mealId);
  const copyId = item.myCopyId;
  // The Cook button's click must not open the tile as well.
  const stop = (event: MouseEvent<HTMLSpanElement>): void =>
    event.stopPropagation();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <Card
      flush
      interactive
      role="button"
      tabIndex={0}
      aria-label={item.name}
      onClick={open}
      onKeyDown={onKeyDown}
    >
      <WashedImage src={item.thumbnailUrl} alt={item.name} seed={item.name} />
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
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <span className="card-title">{item.name}</span>
          <Tag tone="neutral" style={{ flex: 'none' }}>
            {item.category}
          </Tag>
        </div>
        {/* §3.3: catalogue entries always carry the TheMealDB byline. */}
        <div className="card-meta" style={{ justifyContent: 'space-between' }}>
          <span>TheMealDB</span>
          {copyId === null ? null : (
            <span
              onClick={stop}
              onKeyDown={(event) => event.stopPropagation()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <Tag tone="neutral">In your recipes</Tag>
              <Button variant="ghost" onClick={() => onCook(copyId)}>
                <Icon.Play size={13} />
                Cook
              </Button>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// DISC-4 / CAT-2: a TheMealDB entry in the Discover grid. Read-only: it opens the
// catalogue preview, which is the only place it can be saved (CAT-3).
import type { KeyboardEvent, ReactElement } from 'react';
import type { CatalogueItemDto } from '@rsn/shared/util-contracts';
import { Card, Tag, WashedImage } from '@rsn/web/ui';

export interface CatalogueTileProps {
  item: CatalogueItemDto;
  onOpen(mealId: string): void;
}

/** §11.5 guide §3: the card of the Discover grid, with the "TheMealDB" byline. */
export function CatalogueTile({
  item,
  onOpen,
}: CatalogueTileProps): ReactElement {
  const open = (): void => onOpen(item.mealId);
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
        <div className="card-meta">
          <span>TheMealDB</span>
        </div>
      </div>
    </Card>
  );
}

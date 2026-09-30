// DISC-4 / CAT-2 / DISC-10 / UI-21 / UI-36: a TheMealDB entry in the Discover grid.
// Its title opens the catalogue preview; an unsaved tile carries a Save button
// (UI-21, not optimistic); once the caller has a copy (CAT-7, `myCopyId`, or the
// copy the Save just made) it shows "In your recipes" and a Cook button.
import type { ReactElement } from 'react';
import type { CatalogueItemDto } from '@rsn/shared/util-contracts';
import { Button, Card, Icon, InlineError, Tag, WashedImage } from '@rsn/web/ui';

/** UI-21: the Save button of one tile, driven by `POST /recipes/catalogue/:mealId/save`. */
export type CatalogueSaveState =
  | { status: 'saving' }
  | { status: 'saved'; savedId: string }
  | { status: 'error'; message: string };

export interface CatalogueTileProps {
  item: CatalogueItemDto;
  onOpen(mealId: string): void;
  /** DISC-10: opens cook mode on the caller's copy of this meal. */
  onCook(recipeId: string): void;
  /** UI-21: saves the meal as the caller's copy; without it the tile has no Save. */
  onSave?(item: CatalogueItemDto): void;
  /** UI-21: the state of the tile's Save, kept by the screen. */
  saveState?: CatalogueSaveState;
  /** UI-38: false inside a Discover category, whose heading already names it. */
  showCategory?: boolean;
}

/** §11.5 guide §3: the card of the Discover grid, with the "TheMealDB" byline. */
export function CatalogueTile({
  item,
  onOpen,
  onCook,
  onSave,
  saveState,
  showCategory = true,
}: CatalogueTileProps): ReactElement {
  const copyId =
    saveState?.status === 'saved' ? saveState.savedId : item.myCopyId;

  let action: ReactElement | null = null;
  if (copyId !== null) {
    action = (
      <>
        <Tag tone="neutral">In your recipes</Tag>
        <Button variant="ghost" onClick={() => onCook(copyId)}>
          <Icon.Play size={13} />
          Cook
        </Button>
      </>
    );
  } else if (onSave !== undefined) {
    // UI-21: not optimistic — the button spins until the copy exists.
    action = (
      <Button
        variant="secondary"
        loading={saveState?.status === 'saving'}
        onClick={() => onSave(item)}
      >
        {saveState?.status === 'saving' ? null : <Icon.Download size={13} />}
        Save
      </Button>
    );
  }

  return (
    <Card as="article" flush interactive className="card-stretch">
      <WashedImage src={item.thumbnailUrl} alt="" seed={item.name} />
      <div className="card-content align-start">
        {/* UI-36: the tag sits on its own line above the title. */}
        {showCategory ? <Tag tone="neutral">{item.category}</Tag> : null}
        {/* UI-36: the title is the button that opens the tile; its ::after covers the card. */}
        <button
          type="button"
          className="card-title card-open card-clamp"
          title={item.name}
          // UI-41: the meal name is catalogue text; dir="auto" lines it up.
          dir="auto"
          onClick={() => onOpen(item.mealId)}
        >
          {item.name}
        </button>
        {/* §3.3: catalogue entries always carry the TheMealDB byline. */}
        <div className="card-meta card-meta-split self-stretch">
          <span>TheMealDB</span>
          {action === null ? null : (
            <span className="card-above row-inline">{action}</span>
          )}
        </div>
        {saveState?.status === 'error' ? (
          <span className="card-above self-end">
            <InlineError>{saveState.message}</InlineError>
          </span>
        ) : null}
      </div>
    </Card>
  );
}

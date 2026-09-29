// SPEC.md DISC-4 / CAT-2 (a TheMealDB entry in the Discover grid opens its
// preview) and DISC-10 / CAT-7 / UI-14 (once the caller has a copy of the meal,
// the tile shows "In your recipes" and a Cook button on that copy). The
// thumbnail fixture is a local path: renderer code holds no provider URL (§11.3).
import { fireEvent, render, screen } from '@testing-library/react';
import type { CatalogueItemDto } from '@rsn/shared/util-contracts';
import { CatalogueTile } from './catalogue-tile';

const ITEM: CatalogueItemDto = {
  mealId: '52944',
  name: 'Vegan Lasagna',
  thumbnailUrl: '/fixtures/vegan-lasagna.jpg',
  category: 'Vegan',
  myCopyId: null,
};

const ITEM_WITH_COPY: CatalogueItemDto = { ...ITEM, myCopyId: 'copy-7' };

describe('CatalogueTile', () => {
  it('CAT-2 opens the preview of the meal when the tile is clicked', () => {
    const onOpen = vi.fn();
    render(<CatalogueTile item={ITEM} onOpen={onOpen} onCook={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Vegan Lasagna' }));

    expect(onOpen).toHaveBeenCalledWith('52944');
  });

  it('DISC-10 shows neither In your recipes nor Cook while the caller has no copy', () => {
    render(<CatalogueTile item={ITEM} onOpen={vi.fn()} onCook={vi.fn()} />);

    expect(screen.getByText('TheMealDB')).toBeTruthy();
    expect(screen.queryByText('In your recipes')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cook$/ })).toBeNull();
  });

  it('DISC-10 shows In your recipes and Cook when myCopyId is set', () => {
    render(
      <CatalogueTile item={ITEM_WITH_COPY} onOpen={vi.fn()} onCook={vi.fn()} />,
    );

    expect(screen.getByText('In your recipes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Cook$/ })).toBeTruthy();
  });

  it("DISC-10 Cook opens cook mode on the caller's copy without opening the preview", () => {
    const onOpen = vi.fn();
    const onCook = vi.fn();
    render(
      <CatalogueTile item={ITEM_WITH_COPY} onOpen={onOpen} onCook={onCook} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Cook$/ }));

    expect(onCook).toHaveBeenCalledTimes(1);
    expect(onCook).toHaveBeenCalledWith('copy-7');
    expect(onOpen).not.toHaveBeenCalled();
  });
});

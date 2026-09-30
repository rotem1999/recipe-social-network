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

  it('UI-36 renders the tile as an article whose title is a button carrying the full name', () => {
    const { container } = render(
      <CatalogueTile
        item={ITEM_WITH_COPY}
        onOpen={vi.fn()}
        onCook={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const title = screen.getByRole('button', { name: 'Vegan Lasagna' });
    expect(title.closest('article')).toBe(container.firstElementChild);
    expect(title.getAttribute('title')).toBe('Vegan Lasagna');
    expect(container.querySelectorAll('button button')).toHaveLength(0);
  });

  it('UI-36 puts the category tag above the title by default', () => {
    render(<CatalogueTile item={ITEM} onOpen={vi.fn()} onCook={vi.fn()} />);

    const tag = screen.getByText('Vegan');
    const title = screen.getByRole('button', { name: 'Vegan Lasagna' });
    expect(tag.contains(title)).toBe(false);
    expect(
      tag.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('UI-38 drops the category tag when showCategory is false', () => {
    render(
      <CatalogueTile
        item={ITEM}
        onOpen={vi.fn()}
        onCook={vi.fn()}
        showCategory={false}
      />,
    );

    expect(screen.queryByText('Vegan')).toBeNull();
    expect(screen.getByRole('button', { name: 'Vegan Lasagna' })).toBeTruthy();
  });

  it('UI-41 gives the tile title dir="auto"', () => {
    render(<CatalogueTile item={ITEM} onOpen={vi.fn()} onCook={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Vegan Lasagna' }).getAttribute('dir'),
    ).toBe('auto');
  });

  it('DISC-9 loads the thumbnail lazily', () => {
    const { container } = render(
      <CatalogueTile item={ITEM} onOpen={vi.fn()} onCook={vi.fn()} />,
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/fixtures/vegan-lasagna.jpg');
    expect(image?.getAttribute('loading')).toBe('lazy');
  });

  it('UI-21 offers Save on an unsaved tile and hands the item to onSave without opening the preview', () => {
    const onOpen = vi.fn();
    const onSave = vi.fn();
    render(
      <CatalogueTile
        item={ITEM}
        onOpen={onOpen}
        onCook={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(ITEM);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('UI-21 shows no Save when the screen passes no onSave', () => {
    render(<CatalogueTile item={ITEM} onOpen={vi.fn()} onCook={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('UI-21 shows a busy, disabled Save while the save is in flight', () => {
    render(
      <CatalogueTile
        item={ITEM}
        onOpen={vi.fn()}
        onCook={vi.fn()}
        onSave={vi.fn()}
        saveState={{ status: 'saving' }}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('In your recipes')).toBeNull();
  });

  it('UI-21 shows In your recipes and Cook on the new copy once the save returned', () => {
    const onCook = vi.fn();
    render(
      <CatalogueTile
        item={ITEM}
        onOpen={vi.fn()}
        onCook={onCook}
        onSave={vi.fn()}
        saveState={{ status: 'saved', savedId: 'copy-8' }}
      />,
    );

    expect(screen.getByText('In your recipes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Cook$/ }));
    expect(onCook).toHaveBeenCalledWith('copy-8');
  });

  it('UI-21 returns to an enabled Save with the inline message after a failed save', () => {
    render(
      <CatalogueTile
        item={ITEM}
        onOpen={vi.fn()}
        onCook={vi.fn()}
        onSave={vi.fn()}
        saveState={{ status: 'error', message: 'Could not save this recipe.' }}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not save this recipe.',
    );
  });
});

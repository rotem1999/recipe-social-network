// SPEC.md §11.5 UI-10 (meta line), UI-13 (star row) and SAVE-10 (the Home
// card's "Update available" tag on a copy that is behind its source), UI-36 (an
// `article` whose title is a real button, the tag above the title, the clamp)
// and UI-38 / UI-41 / UI-50. The card is presentational, so it needs no API mock
// (libs/web/CLAUDE.md).
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecipeCardDto } from '@rsn/shared/util-contracts';
import { RecipeCard } from './recipe-card';

const BASE: RecipeCardDto = {
  id: 'r1',
  title: 'Shakshuka',
  category: 'Breakfast',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 30,
  visibility: 'public',
  relation: 'public',
  ownerUsername: 'noa',
  source: 'user',
  imageUrl: null,
  rating: { average: 4.5, count: 2, mine: null },
  versionNumber: 1,
  updatedAt: '2026-09-20T18:00:00.000Z',
  myCopyId: null,
  updateAvailable: false,
};

function card(patch: Partial<RecipeCardDto> = {}): RecipeCardDto {
  return { ...BASE, ...patch };
}

describe('RecipeCard', () => {
  it('UI-10 shows "40 min · serves 2" from prepMinutes + cookMinutes', () => {
    render(<RecipeCard recipe={card()} onOpen={vi.fn()} />);

    expect(screen.getByText('40 min · serves 2')).toBeTruthy();
  });

  it('UI-10 omits the minutes when prepMinutes and cookMinutes are both absent', () => {
    render(
      <RecipeCard
        recipe={card({ prepMinutes: undefined, cookMinutes: undefined })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('serves 2')).toBeTruthy();
    expect(screen.queryByText(/min/)).toBeNull();
  });

  it('UI-13 shows the star row for a rated public recipe', () => {
    const { container } = render(
      <RecipeCard recipe={card()} onOpen={vi.fn()} />,
    );

    expect(container.querySelector('.stars-row')).not.toBeNull();
    expect(screen.getByLabelText('4.50 out of 5, 2 ratings')).toBeTruthy();
  });

  it('UI-13 shows no star row when the recipe carries no rating', () => {
    const { container } = render(
      <RecipeCard
        recipe={card({ rating: null, visibility: 'private', relation: 'own' })}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector('.stars-row')).toBeNull();
  });

  it('SAVE-10 tags a saved copy that is behind its source with Update available', () => {
    render(
      <RecipeCard
        recipe={card({
          relation: 'saved',
          visibility: 'private',
          ownerUsername: 'rotem',
          updateAvailable: true,
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Update available')).toBeTruthy();
  });

  it('SAVE-10 tags a fork (relation own) that is behind its source with Update available', () => {
    render(
      <RecipeCard
        recipe={card({
          relation: 'own',
          visibility: 'private',
          ownerUsername: 'rotem',
          updateAvailable: true,
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Update available')).toBeTruthy();
  });

  it('SAVE-10 shows no Update available tag on a copy that is up to date', () => {
    render(
      <RecipeCard
        recipe={card({ relation: 'saved', updateAvailable: false })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByText('Update available')).toBeNull();
  });

  it("SAVE-10 leaves the tag of someone else's recipe to the Discover action slot", () => {
    render(
      <RecipeCard
        recipe={card({ myCopyId: 'copy-1', updateAvailable: true })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByText('Update available')).toBeNull();
  });

  it('UI-36 renders the card as an article whose title is a real button that opens the recipe', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <RecipeCard recipe={card()} onOpen={onOpen} />,
    );

    const article = container.firstElementChild;
    expect(article?.tagName).toBe('ARTICLE');
    const title = screen.getByRole('button', { name: 'Shakshuka' });
    expect(title.tagName).toBe('BUTTON');
    expect(title.getAttribute('type')).toBe('button');
    expect(article?.contains(title)).toBe(true);

    fireEvent.click(title);

    expect(onOpen).toHaveBeenCalledWith('r1');
  });

  it('UI-36 nests no button inside another, and a click on the action never opens the card', () => {
    const onOpen = vi.fn();
    const onSave = vi.fn();
    const { container } = render(
      <RecipeCard
        recipe={card()}
        onOpen={onOpen}
        actionSlot={
          <button type="button" onClick={onSave}>
            Save
          </button>
        }
      />,
    );

    expect(container.querySelector('button button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('UI-36 clamps the title to two lines and keeps the full title in the title attribute', () => {
    const long =
      'Slow-roasted tomato and chickpea shakshuka with herbs, feta and warm flatbread';
    render(<RecipeCard recipe={card({ title: long })} onOpen={vi.fn()} />);

    const title = screen.getByRole('button', { name: long });
    expect(title.getAttribute('title')).toBe(long);
    const text = title.querySelector('.card-clamp');
    expect(text?.textContent).toBe(long);
  });

  it('UI-36 puts the category tag on its own line above the title', () => {
    const { container } = render(
      <RecipeCard recipe={card()} onOpen={vi.fn()} />,
    );

    const tag = screen.getByText('Breakfast');
    const title = screen.getByRole('button', { name: 'Shakshuka' });
    // The tag's own wrapper line comes before the title in the card content.
    const line = tag.parentElement;
    expect(line?.parentElement).toBe(container.querySelector('.card-content'));
    expect(
      line !== null &&
        line !== undefined &&
        (line.compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
    ).toBe(true);
    expect(line?.contains(title)).toBe(false);
  });

  it('UI-38 shows no category tag when showCategory is false', () => {
    render(
      <RecipeCard recipe={card()} onOpen={vi.fn()} showCategory={false} />,
    );

    expect(screen.queryByText('Breakfast')).toBeNull();
    expect(screen.getByRole('button', { name: 'Shakshuka' })).toBeTruthy();
  });

  it('UI-41 gives the title text dir="auto"', () => {
    render(
      <RecipeCard recipe={card({ title: 'שקשוקה' })} onOpen={vi.fn()} />,
    );

    const title = screen.getByRole('button', { name: 'שקשוקה' });
    expect(title.querySelector('[dir="auto"]')?.textContent).toBe('שקשוקה');
  });

  it('UI-50 keeps the title button left-aligned and clamps the title text in a bidi-text element', () => {
    const { container } = render(
      <RecipeCard recipe={card({ title: 'שקשוקה' })} onOpen={vi.fn()} />,
    );

    const title = screen.getByRole('button', { name: 'שקשוקה' });
    expect(title.hasAttribute('dir')).toBe(false);
    expect(container.querySelector('article')?.hasAttribute('dir')).toBe(false);
    const text = title.querySelector('[dir="auto"]');
    expect(text?.classList.contains('bidi-text')).toBe(true);
    expect(text?.classList.contains('card-clamp')).toBe(true);
  });
});

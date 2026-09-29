// SPEC.md §11.5 UI-10 (meta line) and UI-13 (star row). The card is
// presentational, so it needs no API mock (libs/web/CLAUDE.md).
import { render, screen } from '@testing-library/react';
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
});

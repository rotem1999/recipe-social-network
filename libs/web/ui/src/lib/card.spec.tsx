// SPEC.md UI-3 (the guide's `.card`) and UI-36 (recipe cards and TheMealDB tiles
// are `article` elements).
import { cleanup, render } from '@testing-library/react';
import { Card } from './card';

afterEach(cleanup);

describe('Card', () => {
  it('UI-3 renders a div with the card and elevation classes by default', () => {
    const { container } = render(<Card>Body</Card>);

    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe('DIV');
    expect(card.classList.contains('card')).toBe(true);
    expect(card.classList.contains('elev-sm')).toBe(true);
    expect(card.textContent).toBe('Body');
  });

  it('UI-36 renders an article when as="article"', () => {
    const { container } = render(
      <Card as="article" flush interactive className="card-stretch">
        Body
      </Card>,
    );

    const card = container.firstElementChild as HTMLElement;
    expect(card.tagName).toBe('ARTICLE');
    expect(card.classList.contains('card')).toBe(true);
    expect(card.classList.contains('card-flush')).toBe(true);
    expect(card.classList.contains('card-interactive')).toBe(true);
    expect(card.classList.contains('card-stretch')).toBe(true);
  });
});

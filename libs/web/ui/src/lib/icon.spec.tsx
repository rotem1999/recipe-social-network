import { afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Icon } from './icon';

afterEach(cleanup);

function svgOf(container: HTMLElement): SVGElement {
  const svg = container.querySelector('svg');
  if (svg === null) {
    throw new Error('the icon did not render an svg');
  }
  return svg;
}

describe('Icon (UI-5)', () => {
  it('UI-5 renders the svg at stroke-width 2.75, not the lucide default of 2', () => {
    const { container } = render(<Icon.ChefHat />);

    expect(svgOf(container).getAttribute('stroke-width')).toBe('2.75');
  });

  it('UI-5 fixes stroke-width 2.75 on every icon in the wrapper', () => {
    for (const [name, Glyph] of Object.entries(Icon)) {
      const { container, unmount } = render(<Glyph />);
      expect(
        svgOf(container).getAttribute('stroke-width'),
        `Icon.${name} must render at stroke-width 2.75`,
      ).toBe('2.75');
      unmount();
    }
  });

  it('UI-5 renders at the default size of 18 and honours an explicit size', () => {
    const { container, unmount } = render(<Icon.Plus />);
    expect(svgOf(container).getAttribute('width')).toBe('18');
    expect(svgOf(container).getAttribute('height')).toBe('18');
    unmount();

    const sized = render(<Icon.Plus size={15} />);
    expect(svgOf(sized.container).getAttribute('width')).toBe('15');
  });

  it('UI-5 hides a decorative icon from assistive technology', () => {
    const { container } = render(<Icon.Utensils />);

    const svg = svgOf(container);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.querySelector('title')).toBeNull();
  });

  it('UI-5 gives a titled icon the img role and an svg <title>', () => {
    const { container } = render(<Icon.Timer title="Step timer" />);

    const svg = svgOf(container);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.querySelector('title')?.textContent).toBe('Step timer');
    expect(screen.getByRole('img', { name: 'Step timer' })).toBe(svg);
  });

  it('UI-5 passes the className through to the svg', () => {
    const { container } = render(<Icon.Loader2 className="spin" />);

    expect(svgOf(container).getAttribute('class')).toContain('spin');
  });
});

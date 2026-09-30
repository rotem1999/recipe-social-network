import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WashedImage } from './washed-image';

afterEach(cleanup);

describe('WashedImage (UI-3)', () => {
  it('UI-3 draws a tinted placeholder instead of an img when there is no src', () => {
    const { container } = render(<WashedImage alt="Beef stew" seed="Beef stew" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Beef stew' })).not.toBeNull();
  });

  it('UI-3 draws the placeholder when src is null or an empty string', () => {
    const nullSrc = render(<WashedImage src={null} alt="Beef stew" />);
    expect(nullSrc.container.querySelector('img')).toBeNull();
    cleanup();

    const emptySrc = render(<WashedImage src="" alt="Beef stew" />);
    expect(emptySrc.container.querySelector('img')).toBeNull();
  });

  it('UI-3 renders a custom placeholder when one is given', () => {
    const { container } = render(
      <WashedImage alt="Beef stew" placeholder={<span>no photo</span>} />,
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('no photo');
  });

  it('UI-3 picks the placeholder tint deterministically from the seed', () => {
    const first = render(<WashedImage alt="Beef stew" seed="Beef stew" />);
    const background = (first.container.firstElementChild as HTMLElement).style
      .background;
    cleanup();

    const second = render(<WashedImage alt="Beef stew" seed="Beef stew" />);
    expect(
      (second.container.firstElementChild as HTMLElement).style.background,
    ).toBe(background);
    expect(background.length).toBeGreaterThan(0);
  });

  it('IMG-4 renders the signed URL in an img and drops the placeholder tint', () => {
    const { container } = render(
      <WashedImage src="/signed/beef-stew.jpg" alt="Beef stew" />,
    );

    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe('/signed/beef-stew.jpg');
    expect(image?.getAttribute('alt')).toBe('Beef stew');
    expect((container.firstElementChild as HTMLElement).style.background).toBe(
      '',
    );
  });

  it('IMG-4 forwards onError so the screen can refetch an expired signed URL', () => {
    const onError = vi.fn();
    const { container } = render(
      <WashedImage
        src="/signed/expired.jpg"
        alt="Beef stew"
        onError={onError}
      />,
    );

    const image = container.querySelector('img');
    if (image === null) {
      throw new Error('the image was not rendered');
    }
    fireEvent.error(image);

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('UI-3 applies the requested height and the guide wrapper classes', () => {
    const { container } = render(<WashedImage alt="Beef stew" height={150} />);

    const box = container.firstElementChild as HTMLElement;
    expect(box.style.height).toBe('150px');
    expect(box.className.split(' ')).toContain('washed');
    expect(box.className.split(' ')).toContain('washed-box');
  });

  it('UI-3 calls onClick and shows the pointer cursor only when clickable', () => {
    const onClick = vi.fn();
    const { container } = render(
      <WashedImage alt="Beef stew" onClick={onClick} />,
    );

    const box = container.firstElementChild as HTMLElement;
    expect(box.style.cursor).toBe('pointer');
    fireEvent.click(box);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('DISC-9 loads the photo lazily by default', () => {
    const { container } = render(
      <WashedImage src="/signed/beef-stew.jpg" alt="Beef stew" />,
    );

    expect(container.querySelector('img')?.getAttribute('loading')).toBe(
      'lazy',
    );
  });

  it('UNSPECIFIED loads the photo eagerly when a screen asks for it', () => {
    const { container } = render(
      <WashedImage src="/signed/beef-stew.jpg" alt="Beef stew" loading="eager" />,
    );

    expect(container.querySelector('img')?.getAttribute('loading')).toBe(
      'eager',
    );
  });
});

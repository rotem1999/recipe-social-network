import type { ReactElement, ReactEventHandler, ReactNode } from 'react';
import { cx } from './class-names';
import { Icon } from './icon';

/** The guide's placeholder tints: [background, ink], rotated per recipe. */
const TINTS: readonly (readonly [string, string])[] = [
  ['var(--color-accent-200)', 'var(--color-accent-700)'],
  ['var(--color-accent-2-200)', 'var(--color-accent-2-700)'],
  ['var(--color-neutral-200)', 'var(--color-neutral-600)'],
];

function tintIndex(seed: string): number {
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) {
    sum += seed.charCodeAt(i);
  }
  return sum % TINTS.length;
}

export interface WashedImageProps {
  /** A short-lived signed URL (IMG-4); when absent a tinted placeholder is drawn. */
  src?: string | null;
  alt: string;
  height?: number;
  /** Picks the placeholder tint deterministically, e.g. the recipe title. */
  seed?: string;
  /** Glyph drawn on the placeholder; the utensils icon by default. */
  placeholder?: ReactNode;
  /** IMG-4: signed URLs expire — the screen refetches from here. */
  onError?: ReactEventHandler<HTMLImageElement>;
  onClick?: () => void;
  className?: string;
  /** DISC-9: grid tiles load their photo lazily; 'lazy' unless a screen asks otherwise. */
  loading?: 'lazy' | 'eager';
}

/** UI-3: every photograph goes through the guide's `.washed` wrapper. */
export function WashedImage({
  src,
  alt,
  height = 110,
  seed = '',
  placeholder,
  onError,
  onClick,
  className,
  loading = 'lazy',
}: WashedImageProps): ReactElement {
  const [background, ink] = TINTS[tintIndex(seed)];
  const hasSrc = src !== undefined && src !== null && src !== '';

  return (
    <div
      className={cx('washed', 'washed-box', className)}
      style={{
        height: `${height}px`,
        background: hasSrc ? undefined : background,
        color: hasSrc ? undefined : ink,
        cursor: onClick === undefined ? undefined : 'pointer',
      }}
      onClick={onClick}
    >
      {hasSrc ? (
        <img src={src} alt={alt} loading={loading} onError={onError} />
      ) : (
        (placeholder ?? <Icon.Utensils size={30} title={alt} />)
      )}
    </div>
  );
}

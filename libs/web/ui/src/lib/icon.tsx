// UI-5: the single Lucide wrapper. Named imports only, and every icon is
// rendered at stroke-width 2.75 (the guide's "rounder, heavier look";
// lucide-react's own default is 2).
import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChefHat,
  Circle,
  Download,
  History,
  Image,
  Loader2,
  LogOut,
  Minus,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Timer,
  Trash2,
  Users,
  Utensils,
  X,
} from 'lucide-react';

/** UI-5: the only props a screen may set on an icon; the stroke width is fixed. */
export interface IconProps {
  size?: number;
  className?: string;
  /** Renders an SVG <title>, which is both the tooltip and the accessible name. */
  title?: string;
}

export type IconComponent = (props: IconProps) => ReactElement;

const STROKE_WIDTH = 2.75;
const DEFAULT_SIZE = 18;

function wrap(Glyph: LucideIcon, name: string): IconComponent {
  const Wrapped = ({
    size = DEFAULT_SIZE,
    className,
    title,
  }: IconProps): ReactElement => (
    <Glyph
      size={size}
      className={className}
      strokeWidth={STROKE_WIDTH}
      aria-hidden={title === undefined ? true : undefined}
      role={title === undefined ? undefined : 'img'}
    >
      {title === undefined ? null : <title>{title}</title>}
    </Glyph>
  );
  Wrapped.displayName = `Icon.${name}`;
  return Wrapped;
}

/** UI-5: every icon the CookBook screens use, already at stroke-width 2.75. */
export const Icon = {
  ChefHat: wrap(ChefHat, 'ChefHat'),
  Play: wrap(Play, 'Play'),
  Plus: wrap(Plus, 'Plus'),
  Download: wrap(Download, 'Download'),
  Timer: wrap(Timer, 'Timer'),
  Sparkles: wrap(Sparkles, 'Sparkles'),
  ArrowLeft: wrap(ArrowLeft, 'ArrowLeft'),
  X: wrap(X, 'X'),
  Utensils: wrap(Utensils, 'Utensils'),
  Circle: wrap(Circle, 'Circle'),
  Star: wrap(Star, 'Star'),
  ArrowUp: wrap(ArrowUp, 'ArrowUp'),
  ArrowDown: wrap(ArrowDown, 'ArrowDown'),
  Search: wrap(Search, 'Search'),
  Users: wrap(Users, 'Users'),
  LogOut: wrap(LogOut, 'LogOut'),
  Trash2: wrap(Trash2, 'Trash2'),
  Pencil: wrap(Pencil, 'Pencil'),
  Share2: wrap(Share2, 'Share2'),
  ImageIcon: wrap(Image, 'ImageIcon'),
  Check: wrap(Check, 'Check'),
  Minus: wrap(Minus, 'Minus'),
  Loader2: wrap(Loader2, 'Loader2'),
  History: wrap(History, 'History'),
} as const satisfies Record<string, IconComponent>;

export type IconName = keyof typeof Icon;

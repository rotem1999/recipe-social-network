import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from './class-names';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "Nutrition source". */
  label?: string;
  compact?: boolean;
  className?: string;
}

/** UI-3: the guide's `.seg` / `.seg-opt` on native radios — sign-in/sign-up (UI-9), nutrition mode (NUT-4). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  compact = false,
  className,
}: SegmentedProps<T>): ReactElement {
  const name = useId();
  return (
    <span className={cx('seg', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx('seg-opt', compact && 'seg-opt-compact')}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </span>
  );
}

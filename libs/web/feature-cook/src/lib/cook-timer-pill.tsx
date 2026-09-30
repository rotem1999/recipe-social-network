// SPEC.md §11.5 UI-15: every running or finished cook-mode timer is a pill in
// the top bar with its step number and time left. Clicking the pill jumps to
// that step, × dismisses it, and a finished pill flashes until dismissed.
import type { ReactElement } from 'react';
import { Button, Icon } from '@rsn/web/ui';

/** The guide's countdown text: "6:59", never below "0:00". */
export function formatTimer(seconds: number): string {
  const total = Math.max(seconds, 0);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export interface CookTimerPillProps {
  /** 0-based step the timer belongs to; shown 1-based. */
  stepIndex: number;
  secondsLeft: number;
  onOpen: () => void;
  onDismiss: () => void;
}

export function CookTimerPill({
  stepIndex,
  secondsLeft,
  onOpen,
  onDismiss,
}: CookTimerPillProps): ReactElement {
  const done = secondsLeft <= 0;
  const label = `Step ${stepIndex + 1} · ${done ? 'Done — ' : ''}${formatTimer(secondsLeft)}`;
  return (
    <span
      // UI-15: `.pulse` is the stylesheet's opacity flash; it runs until × is pressed.
      className={done ? 'timer-pill is-done pulse' : 'timer-pill'}
      role="group"
      aria-label={`Step ${stepIndex + 1} timer`}
    >
      <Button
        variant="ghost"
        onClick={onOpen}
        title={`Go to step ${stepIndex + 1}`}
        className="timer-pill-open"
      >
        <Icon.Timer size={13} />
        {label}
      </Button>
      <Button
        variant="ghost"
        onClick={onDismiss}
        aria-label={`Dismiss the step ${stepIndex + 1} timer`}
        title="Dismiss"
      >
        <Icon.X size={13} />
      </Button>
    </span>
  );
}

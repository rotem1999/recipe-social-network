// SPEC.md §11.5 UI-15: when a cook-mode timer reaches zero a short chime plays,
// made with Web Audio — no sound file is shipped or fetched.

/**
 * Browsers only let an AudioContext make sound after a user gesture, so the
 * screen creates (or resumes) it from the "Start timer" click and keeps it
 * until cook mode closes. Returns null where Web Audio is missing (tests).
 */
export function openChimeContext(
  existing: AudioContext | null,
): AudioContext | null {
  if (existing !== null) {
    if (existing.state === 'suspended') {
      void existing.resume().catch(() => undefined);
    }
    return existing;
  }
  if (
    typeof window === 'undefined' ||
    typeof window.AudioContext !== 'function'
  ) {
    return null;
  }
  try {
    return new window.AudioContext();
  } catch {
    return null;
  }
}

/** Two soft rising notes, about 0.6 s in all (the notes Rotem delegated). */
const CHIME_NOTES: ReadonlyArray<{ hz: number; at: number }> = [
  { hz: 880, at: 0 },
  { hz: 1320, at: 0.22 },
];
const NOTE_SECONDS = 0.35;
const NOTE_PEAK_GAIN = 0.25;

/** UI-15: plays the chime once; a missing or blocked context stays silent. */
export function playChime(context: AudioContext | null): void {
  if (context === null) {
    return;
  }
  try {
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
    const start = context.currentTime + 0.02;
    for (const note of CHIME_NOTES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const begin = start + note.at;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.hz, begin);
      // A quick attack and an exponential fade, so the note never clicks.
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(NOTE_PEAK_GAIN, begin + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + NOTE_SECONDS);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(begin);
      oscillator.stop(begin + NOTE_SECONDS + 0.05);
    }
  } catch {
    // A chime that cannot play must never break cook mode.
  }
}

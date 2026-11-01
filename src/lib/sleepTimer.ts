import { formatTime } from "./format";

/** Presets offered by the sleep menu, in minutes. */
export const SLEEP_MINUTES = [5, 15, 30, 45, 60] as const;

/** The last stretch of a timed sleep, during which the volume eases to zero. */
export const FADE_SECONDS = 10;

export type SleepTimer =
  | { kind: "minutes"; minutes: number; endsAt: number }
  /** Handled by the player state machine: pause when the current track ends. */
  | { kind: "track" };

export function startSleepTimer(minutes: number, now: number): SleepTimer {
  return { kind: "minutes", minutes, endsAt: now + minutes * 60_000 };
}

/** Milliseconds left on a timed sleep; `null` for the end-of-track variant. */
export function remainingMs(timer: SleepTimer, now: number): number | null {
  return timer.kind === "minutes" ? Math.max(0, timer.endsAt - now) : null;
}

/** Linear volume multiplier: 1 until the fade window, then down to 0 at expiry. */
export function fadeGain(remaining: number): number {
  const window = FADE_SECONDS * 1000;
  if (remaining >= window) return 1;
  return Math.max(0, remaining / window);
}

/** `754_000` -> `12:34`; rounds up so the label never shows 0:00 while still armed. */
export function formatRemaining(remaining: number): string {
  return formatTime(Math.ceil(remaining / 1000));
}

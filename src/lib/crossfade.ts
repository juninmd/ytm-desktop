/** Crossfade lengths offered in the UI, in seconds (`0` is off, which is still gapless). */
export const CROSSFADE_SECONDS = [0, 3, 6, 9, 12] as const;
export const MAX_CROSSFADE = 12;

/**
 * Equal-power curves: the summed loudness stays constant through the overlap,
 * where a linear ramp would sag in the middle. `progress` is 0 at the start of
 * the overlap and 1 at the end.
 */
export function crossfadeGains(progress: number): { out: number; in: number } {
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
}

export type CrossfadeInput = {
  /** The user's crossfade length, in seconds. */
  seconds: number;
  /** Media seconds left in the playing track. */
  remaining: number;
  /** Whether the next track is loaded and waiting. */
  nextReady: boolean;
  playing: boolean;
  repeatOne: boolean;
  /** The sleep timer wants playback to stop at the end of this track. */
  stopAfterTrack: boolean;
  alreadyFading: boolean;
};

/** Smallest overlap worth starting; below it the plain track change is smoother. */
const MIN_OVERLAP = 0.4;

/** Whether the overlap should begin now. */
export function shouldStartCrossfade(input: CrossfadeInput): boolean {
  if (input.seconds <= 0 || input.alreadyFading || !input.nextReady || !input.playing) return false;
  if (input.repeatOne || input.stopAfterTrack) return false;
  if (!Number.isFinite(input.remaining)) return false;
  return input.remaining <= input.seconds && input.remaining > MIN_OVERLAP;
}

/** How long the overlap lasts in wall-clock ms: the media left, scaled by playback speed. */
export function crossfadeDurationMs(remaining: number, seconds: number, rate: number): number {
  const media = Math.min(Math.max(remaining, 0), Math.max(seconds, 0));
  return (media / Math.max(rate, 0.1)) * 1000;
}

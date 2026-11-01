import { useCallback, useEffect, useRef, useState } from "react";
import { fadeGain, remainingMs, startSleepTimer, type SleepTimer } from "../lib/sleepTimer";

type Options = {
  /** The element currently producing sound, if any. */
  getAudio: () => HTMLAudioElement | null;
  /** The user's volume, which the fade scales. */
  getVolume: () => number;
  /**
   * The current fade multiplier. The player multiplies it into every volume it
   * applies, so a track change mid-fade cannot jump back to full volume.
   */
  fade: { current: number };
  /** Whether the reducer is still waiting for the end of the track. */
  stopAfterTrack: boolean;
  setStopAfterTrack: (value: boolean) => void;
  /** Called when a timed sleep expires: pause, and tell the user. */
  onExpire: () => void;
};

const TICK_MS = 250;

/**
 * A sleep timer with two flavours: a wall-clock countdown that eases the volume
 * out over its last seconds, and "end of this track", which the playback
 * reducer enforces (so it survives a skipped or repeated track correctly).
 */
export function useSleepTimer({
  getAudio,
  getVolume,
  fade,
  stopAfterTrack,
  setStopAfterTrack,
  onExpire,
}: Options) {
  const [sleep, setSleepState] = useState<SleepTimer | null>(null);
  const latest = useRef({ getAudio, getVolume, onExpire });
  latest.current = { getAudio, getVolume, onExpire };

  const setSleep = useCallback(
    (next: SleepTimer | null) => {
      setSleepState(next);
      setStopAfterTrack(next?.kind === "track");
    },
    [setStopAfterTrack],
  );

  const startMinutes = useCallback(
    (minutes: number) => setSleep(startSleepTimer(minutes, Date.now())),
    [setSleep],
  );

  // The reducer disarms the flag when it fires (or when a new context starts
  // playing); the timer follows so the UI never shows a stale "armed" state.
  useEffect(() => {
    if (sleep?.kind === "track" && !stopAfterTrack) setSleepState(null);
  }, [sleep, stopAfterTrack]);

  useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    let expired = false;

    const timer = window.setInterval(() => {
      const left = remainingMs(sleep, Date.now()) ?? 0;
      if (left <= 0) {
        expired = true;
        window.clearInterval(timer);
        // The pause effect restores the volume once the element is paused, so
        // there is no moment of full volume between silence and the pause.
        fade.current = 1;
        latest.current.onExpire();
        setSleepState(null);
        return;
      }
      fade.current = fadeGain(left);
      const audio = latest.current.getAudio();
      if (audio) audio.volume = latest.current.getVolume() * fade.current;
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      if (expired) return;
      // Cancelled mid-fade: playback goes on, so the volume must not stay lowered.
      fade.current = 1;
      const audio = latest.current.getAudio();
      if (audio) audio.volume = latest.current.getVolume();
    };
  }, [sleep, fade]);

  return { sleep, setSleep, startMinutes };
}

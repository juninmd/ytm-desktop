import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PlayerState, Track } from "../types";
import { isDesktop } from "../lib/auth";
import {
  localStreamUrl,
  prefetchStream,
  rateTrack,
  resolveRemoteStream,
  resolveStream,
  resolverStatus,
} from "../lib/music";
import {
  createInitialState,
  MAX_RESUME_TRACKS,
  peekNext,
  reducer,
  snapshotSession,
  type Preferences,
} from "./playerReducer";
import { useSleepTimer } from "./useSleepTimer";
import { crossfadeDurationMs, crossfadeGains, shouldStartCrossfade } from "../lib/crossfade";
import type { SleepTimer } from "../lib/sleepTimer";
import { useI18n } from "../lib/i18n";

/**
 * The playback state machine, plus the audio sink.
 *
 * The reducer lives in `playerReducer.ts` (pure, unit-tested). Two sinks drive
 * it:
 *
 * * **Real audio** (desktop, track resolvable): a hidden `<audio>` element
 *   streams the url yt-dlp resolved. Its `timeupdate` / `ended` events feed the
 *   reducer, so the transport is genuinely playing sound.
 * * **Simulated** (browser preview, or yt-dlp missing): the tick timer advances
 *   the playhead so the UI can still be driven and reviewed.
 *
 * Which one is active is surfaced as `engine`, so the UI never has to guess.
 */

export type PlaybackEngine = "sim" | "audio";

const STORAGE_KEY = "ytm-desktop:preferences";

/** A track is worth resuming only if it still looks like one. */
function readSession(value: unknown): Preferences["session"] {
  if (!value || typeof value !== "object") return undefined;
  const session = value as Record<string, unknown>;
  if (!Array.isArray(session.queue) || session.queue.length === 0) return undefined;

  const queue: Track[] = [];
  for (const entry of session.queue.slice(0, MAX_RESUME_TRACKS)) {
    if (!entry || typeof entry !== "object") continue;
    const track = entry as Partial<Track>;
    if (typeof track.id !== "string" || typeof track.title !== "string") continue;
    // Rebuilt field by field: the stored blob is user-writable, so only known
    // shapes are trusted.
    queue.push({
      id: track.id,
      title: track.title,
      artist: typeof track.artist === "string" ? track.artist : "",
      album: typeof track.album === "string" ? track.album : "",
      albumId: typeof track.albumId === "string" ? track.albumId : "",
      duration:
        typeof track.duration === "number" && Number.isFinite(track.duration)
          ? Math.max(0, track.duration)
          : 0,
      year: typeof track.year === "number" ? track.year : 0,
      plays: typeof track.plays === "string" ? track.plays : "",
      thumbnail: typeof track.thumbnail === "string" ? track.thumbnail : undefined,
    });
  }
  if (queue.length === 0) return undefined;

  return {
    queue,
    cursor: typeof session.cursor === "number" ? session.cursor : 0,
    position: typeof session.position === "number" ? session.position : 0,
    shuffle: session.shuffle === true,
    savedAt: typeof session.savedAt === "number" ? session.savedAt : 0,
  };
}

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      volume:
        typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
          ? Math.min(Math.max(parsed.volume, 0), 1)
          : 0.7,
      repeat: parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off",
      liked: Array.isArray(parsed.liked) ? parsed.liked : [],
      autoplay: typeof parsed.autoplay === "boolean" ? parsed.autoplay : true,
      rate: typeof parsed.rate === "number" && Number.isFinite(parsed.rate) ? parsed.rate : 1,
      crossfade:
        typeof parsed.crossfade === "number" && Number.isFinite(parsed.crossfade) ? parsed.crossfade : 0,
      session: readSession(parsed.session),
    };
  } catch {
    return { volume: 0.7, repeat: "off", liked: [], autoplay: true, rate: 1, crossfade: 0 };
  }
}

function writePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private mode / quota: preferences are a nicety, never a failure.
  }
}

export type PlayerApi = {
  state: PlayerState;
  current: Track | null;
  upNext: Track[];
  /** Whether sound is real (`audio`) or the transport is running simulated. */
  engine: PlaybackEngine;
  /** `null` while unknown; `false` when real audio is impossible (no yt-dlp). */
  resolverAvailable: boolean | null;
  play: (queue: Track[], startIndex?: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (id: string) => void;
  /** Seeds likes from the connected account. */
  syncLiked: (ids: string[]) => void;
  /** Appends a radio to the queue and starts it. */
  appendRadio: (tracks: Track[]) => void;
  /** Turns the end-of-queue radio on or off. */
  toggleAutoplay: () => void;
  /** Queues tracks right after the current one, or at the end. */
  enqueue: (tracks: Track[], where: "next" | "last") => void;
  /** Queue edits address upcoming entries by their position in play order. */
  dequeue: (position: number) => void;
  moveQueued: (from: number, to: number) => void;
  clearUpcoming: () => void;
  jump: (position: number) => void;
  setRate: (value: number) => void;
  /** Seconds of overlap between tracks; `0` keeps the change gapless. */
  setCrossfade: (seconds: number) => void;
  /** The armed sleep timer, if any. */
  sleep: SleepTimer | null;
  startSleep: (minutes: number) => void;
  sleepAtEndOfTrack: () => void;
  cancelSleep: () => void;
  /** Dismissible, short-lived message (e.g. a failed account write). */
  notice: string | null;
  /** `warn` is an error the user should look at; `info` is a plain confirmation. */
  noticeTone: "info" | "warn";
  dismissNotice: () => void;
  /** Shows a short-lived message (e.g. a failed download). */
  notify: (message: string, tone?: "info" | "warn") => void;
  isLiked: (id: string) => boolean;
  isCurrent: (id: string) => boolean;
};

const PlayerContext = createContext<PlayerApi | null>(null);

/** Tick resolution: fine enough for a smooth scrubber, coarse enough to stay cheap. */
const TICK_MS = 250;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(loadPreferences()));
  const [engine, setEngine] = useState<PlaybackEngine>("sim");
  const [resolverAvailable, setResolverAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "warn">("warn");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Sleep-timer fade, multiplied into every volume applied to the element.
  const fadeRef = useRef(1);
  const noticeTimer = useRef<number | undefined>(undefined);
  // The next track, resolved and buffering on a second element so the change is
  // gapless; and the overlap in progress when a crossfade is running.
  const nextSlot = useRef<{ id: string; audio: HTMLAudioElement } | null>(null);
  const fading = useRef<{ from: HTMLAudioElement; to: HTMLAudioElement; timer: number } | null>(null);

  // Latest state, readable from audio callbacks without re-subscribing.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Ask once whether real audio is even possible on this machine, so the UI can
  // say *why* the transport is simulated instead of just showing a badge.
  useEffect(() => {
    if (!isDesktop()) return;
    let cancelled = false;
    void resolverStatus()
      .then((status) => {
        if (!cancelled) setResolverAvailable(status.available);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const current = state.queue[state.order[state.cursor]] ?? null;
  const currentId = current?.id ?? null;
  const useRealAudio = isDesktop() && currentId !== null;

  // Warm the next track's stream while the current one plays, so the gap
  // between tracks is the cache lookup instead of a yt-dlp run.
  useEffect(() => {
    if (!isDesktop()) return;
    const nextIndex = state.order[state.cursor + 1];
    const next = nextIndex === undefined ? undefined : state.queue[nextIndex];
    if (next && next.id !== currentId) void prefetchStream(next.id).catch(() => {});
  }, [currentId, state.cursor, state.order, state.queue]);

  /** Stops an overlap that is no longer wanted and puts both elements back. */
  const abortCrossfade = useCallback(() => {
    const running = fading.current;
    if (!running) return;
    window.clearInterval(running.timer);
    fading.current = null;
    running.to.pause();
    try {
      running.to.currentTime = 0;
    } catch {
      // Not seekable yet; it is silent and paused either way.
    }
    running.to.volume = 0;
    running.from.volume = stateRef.current.volume * fadeRef.current;
  }, []);

  /** Starts the overlap when the playing track is close enough to its end. */
  const maybeCrossfade = useCallback(
    (from: HTMLAudioElement) => {
      const latest = stateRef.current;
      const slot = nextSlot.current;
      const remaining = from.duration - from.currentTime;
      const ready =
        slot !== null && slot.audio.readyState >= 2 && peekNext(latest)?.id === slot.id;
      if (
        !slot ||
        !shouldStartCrossfade({
          seconds: latest.crossfade,
          remaining,
          nextReady: ready,
          playing: latest.isPlaying,
          repeatOne: latest.repeat === "one",
          stopAfterTrack: latest.stopAfterTrack,
          alreadyFading: fading.current !== null,
        })
      ) {
        return;
      }

      const to = slot.audio;
      const total = crossfadeDurationMs(remaining, latest.crossfade, latest.rate);
      to.volume = 0;
      to.muted = latest.muted;
      to.defaultPlaybackRate = latest.rate;
      to.playbackRate = latest.rate;
      void to.play().catch(abortCrossfade);

      const began = performance.now();
      const timer = window.setInterval(() => {
        const progress = total > 0 ? (performance.now() - began) / total : 1;
        const gain = crossfadeGains(progress);
        const volume = stateRef.current.volume * fadeRef.current;
        from.volume = volume * gain.out;
        to.volume = volume * gain.in;
        if (progress >= 1) {
          window.clearInterval(timer);
          fading.current = null;
          from.pause();
          dispatch({ type: "next", manual: false });
        }
      }, 50);
      fading.current = { from, to, timer };
    },
    [abortCrossfade],
  );

  const releaseSlot = useCallback(() => {
    const slot = nextSlot.current;
    nextSlot.current = null;
    if (!slot) return;
    slot.audio.pause();
    slot.audio.removeAttribute("src");
    slot.audio.load();
  }, []);

  useEffect(
    () => () => {
      abortCrossfade();
      releaseSlot();
    },
    [abortCrossfade, releaseSlot],
  );

  // Load (or reload) the real stream whenever the track — or a replay — changes.
  useEffect(() => {
    if (!useRealAudio || !currentId) return;

    let cancelled = false;
    // The preloaded element for this very track is taken over as-is (already
    // buffered, possibly already playing mid-crossfade); any other is stale.
    const slot = nextSlot.current;
    // A preload that failed to load must not be adopted: no `error` event would follow.
    const adopted = slot && slot.id === currentId && !slot.audio.error ? slot.audio : null;
    if (fading.current && fading.current.to !== adopted) abortCrossfade();
    if (adopted && fading.current?.to === adopted) {
      window.clearInterval(fading.current.timer);
      fading.current = null;
    }
    if (slot) {
      nextSlot.current = null;
      if (!adopted) {
        slot.audio.pause();
        slot.audio.removeAttribute("src");
        slot.audio.load();
      }
    }

    const audio = adopted ?? new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    if (!adopted) setEngine("sim");

    const onTime = () => {
      dispatch({ type: "sync", position: audio.currentTime });
      maybeCrossfade(audio);
    };
    const onMeta = () => {
      dispatch({ type: "duration", duration: audio.duration });
      // Metadata loaded: the element can actually play, so claim real audio.
      setEngine("audio");
    };
    let usedLocal = false;
    let triedRemote = false;

    /** Loads a stream, preferring the downloaded file. */
    const start = async (allowLocal: boolean) => {
      const info = allowLocal
        ? await resolveStream(currentId)
        : await resolveRemoteStream(currentId);
      if (cancelled) return;
      usedLocal = info.local;
      audio.volume = stateRef.current.volume * fadeRef.current;
      audio.muted = stateRef.current.muted;
      // Setting `src` resets the rate to the default, so both are set.
      audio.defaultPlaybackRate = stateRef.current.rate;
      audio.playbackRate = stateRef.current.rate;
      audio.src = info.local ? localStreamUrl(info.url) : info.url;
      audio.load();
      if (stateRef.current.isPlaying) {
        // A rejected `play()` means no real sound: degrade to the simulation.
        await audio.play().catch(() => {
          if (!cancelled) setEngine("sim");
        });
      }
    };

    const onError = () => {
      if (cancelled) return;
      // A downloaded file that will not play (e.g. the asset scope) falls back
      // to the network once, then to the simulated transport.
      if (usedLocal && !triedRemote) {
        triedRemote = true;
        void start(false).catch(() => {
          if (!cancelled) setEngine("sim");
        });
        return;
      }
      setEngine("sim");
    };
    const onEnded = () => {
      const latest = stateRef.current;
      dispatch({ type: "ended" });
      if (latest.repeat === "one" && !latest.stopAfterTrack) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    if (adopted) {
      audio.volume = stateRef.current.volume * fadeRef.current;
      audio.muted = stateRef.current.muted;
      audio.defaultPlaybackRate = stateRef.current.rate;
      audio.playbackRate = stateRef.current.rate;
      if (stateRef.current.isPlaying && audio.paused) {
        void audio.play().catch(() => {
          if (!cancelled) setEngine("sim");
        });
      }
      if (audio.readyState >= 1) onMeta(); // the duration is already known
    } else {
      void start(true).catch(() => {
        // No real stream available (yt-dlp missing, offline): the simulated
        // transport takes over instead of leaving the user with a dead player.
        if (!cancelled) setEngine("sim");
      });
    }

    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, [currentId, state.playToken, useRealAudio, abortCrossfade, maybeCrossfade]);

  // Buffer the next track on its own element, so the change has no resolve gap.
  const upcomingId = peekNext(state)?.id ?? null;
  useEffect(() => {
    if (!isDesktop() || engine !== "audio") return;
    if (!upcomingId || state.repeat === "one") {
      if (!fading.current) releaseSlot();
      return;
    }
    if (nextSlot.current?.id === upcomingId) return;
    releaseSlot();
    let cancelled = false;
    void resolveStream(upcomingId)
      .then((info) => {
        if (cancelled) return;
        const audio = new Audio();
        audio.preload = "auto";
        audio.volume = 0;
        audio.src = info.local ? localStreamUrl(info.url) : info.url;
        audio.load();
        nextSlot.current = { id: upcomingId, audio };
      })
      .catch(() => {
        // Not resolvable yet: the change falls back to the ordinary load.
      });
    return () => {
      cancelled = true;
    };
  }, [upcomingId, engine, state.repeat, currentId, releaseSlot]);

  // Play/pause is driven by the real element when one is loaded.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || engine !== "audio") return;
    if (!state.isPlaying) abortCrossfade();
    if (state.isPlaying) void audio.play().catch(() => {});
    else audio.pause();
    // A sleep fade leaves the element silent; paused now, it is safe to restore.
    audio.volume = stateRef.current.volume * fadeRef.current;
  }, [state.isPlaying, engine, abortCrossfade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.volume * fadeRef.current;
    audio.muted = state.muted;
  }, [state.volume, state.muted, engine]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = state.rate;
    audio.playbackRate = state.rate;
  }, [state.rate, engine]);

  // Simulated tick — only while no real audio is driving the playhead.
  useEffect(() => {
    if (!state.isPlaying || engine === "audio") return;
    const timer = window.setInterval(() => {
      dispatch({ type: "tick", delta: (TICK_MS / 1000) * stateRef.current.rate });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.isPlaying, engine]);

  // The last persisted shape, so either effect below can write the whole thing.
  const persisted = useRef<Preferences>(loadPreferences());

  // Structural changes (and the pause/unpause beat) write immediately.
  useEffect(() => {
    persisted.current = {
      ...persisted.current,
      volume: state.volume,
      repeat: state.repeat,
      liked: state.liked,
      autoplay: state.autoplay,
      rate: state.rate,
      crossfade: state.crossfade,
      session: snapshotSession(stateRef.current),
    };
    writePreferences(persisted.current);
  }, [
    state.volume,
    state.repeat,
    state.liked,
    state.autoplay,
    state.rate,
    state.crossfade,
    state.queue,
    state.order,
    state.cursor,
    state.shuffle,
    state.isPlaying,
  ]);

  // While playing, the playhead is saved periodically rather than every tick.
  useEffect(() => {
    if (!state.isPlaying) return;
    const timer = window.setInterval(() => {
      persisted.current = {
        ...persisted.current,
        session: snapshotSession(stateRef.current),
      };
      writePreferences(persisted.current);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [state.isPlaying]);

  const play = useCallback((queue: Track[], startIndex = 0) => {
    dispatch({ type: "play", queue, startIndex });
  }, []);

  const seek = useCallback((seconds: number) => {
    abortCrossfade(); // a seek during an overlap starts the overlap over, later
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = seconds;
      } catch {
        // Not seekable yet; the reducer still moves the scrubber.
      }
    }
    dispatch({ type: "seek", position: seconds });
  }, [abortCrossfade]);

  const flash = useCallback((message: string, tone: "info" | "warn" = "warn") => {
    setNotice(message);
    setNoticeTone(tone);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  /**
   * Optimistic like. With a connected library the heart writes through to the
   * account (`music_rate`); the change is rolled back if that write fails. With
   * no library the like stays local, which is the honest offline behaviour.
   */
  const toggleLike = useCallback(
    (id: string) => {
      const willLike = !stateRef.current.liked.includes(id);
      dispatch({ type: "like", id });
      if (!isDesktop()) return;
      void rateTrack(id, willLike ? "like" : "none")
        .then((written) => {
          if (!written) return; // No account connected: the local like stands.
        })
        .catch(() => {
          dispatch({ type: "like", id }); // Undo the optimistic change.
          flash(t("player.likeFailed"));
        });
    },
    [flash, t],
  );

  const syncLiked = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: "sync-liked", ids });
  }, []);

  const appendRadio = useCallback((tracks: Track[]) => {
    dispatch({ type: "append", tracks });
  }, []);

  const toggleAutoplay = useCallback(() => {
    dispatch({ type: "autoplay" });
  }, []);

  const enqueue = useCallback(
    (tracks: Track[], where: "next" | "last") => {
      if (tracks.length === 0) return;
      const idle = stateRef.current.queue.length === 0;
      dispatch({ type: "enqueue", tracks, where });
      if (idle) return; // it just started playing; there is nothing to confirm
      const one = tracks.length === 1;
      const key =
        where === "next"
          ? one ? "queue.addedNext" : "queue.addedNextMany"
          : one ? "queue.addedLast" : "queue.addedLastMany";
      flash(t(key, { title: tracks[0].title, count: tracks.length }), "info");
    },
    [flash, t],
  );

  const dequeue = useCallback((position: number) => dispatch({ type: "dequeue", position }), []);
  const moveQueued = useCallback(
    (from: number, to: number) => dispatch({ type: "move", from, to }),
    [],
  );
  const clearUpcoming = useCallback(() => dispatch({ type: "clear-upcoming" }), []);
  const jump = useCallback((position: number) => dispatch({ type: "jump", position }), []);
  const setRate = useCallback((value: number) => dispatch({ type: "rate", value }), []);
  const setCrossfade = useCallback(
    (seconds: number) => dispatch({ type: "crossfade", seconds }),
    [],
  );

  const setStopAfterTrack = useCallback(
    (value: boolean) => dispatch({ type: "stop-after", value }),
    [],
  );
  const onSleepExpire = useCallback(() => {
    dispatch({ type: "pause" });
    flash(t("sleep.fired"), "info");
  }, [flash, t]);
  const { sleep, setSleep, startMinutes } = useSleepTimer({
    getAudio: () => audioRef.current,
    getVolume: () => stateRef.current.volume,
    fade: fadeRef,
    stopAfterTrack: state.stopAfterTrack,
    setStopAfterTrack,
    onExpire: onSleepExpire,
  });
  const sleepAtEndOfTrack = useCallback(() => setSleep({ kind: "track" }), [setSleep]);
  const cancelSleep = useCallback(() => setSleep(null), [setSleep]);

  const dismissNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  // --- OS media integration (media keys, the system overlay) ---------------
  // The sign-in screen promises background playback with native controls; this
  // is what delivers it, via the Media Session API Chromium/WebView2 expose.
  const actionsRef = useRef({
    toggle: () => dispatch({ type: "toggle" }),
    next: () => dispatch({ type: "next", manual: true }),
    previous: () => dispatch({ type: "previous" }),
    seek,
  });
  actionsRef.current = {
    toggle: () => dispatch({ type: "toggle" }),
    next: () => dispatch({ type: "next", manual: true }),
    previous: () => dispatch({ type: "previous" }),
    seek,
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (typeof MediaMetadata === "undefined") return;
    session.metadata = current
      ? new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album,
          artwork: current.thumbnail ? [{ src: current.thumbnail }] : [],
        })
      : null;
  }, [current]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some handlers are not supported by every build; skip them.
      }
    };
    const actions: MediaSessionAction[] = [
      "play",
      "pause",
      "nexttrack",
      "previoustrack",
      "seekto",
      "seekbackward",
      "seekforward",
    ];

    set("play", () => {
      if (!stateRef.current.isPlaying) actionsRef.current.toggle();
    });
    set("pause", () => {
      if (stateRef.current.isPlaying) actionsRef.current.toggle();
    });
    set("nexttrack", () => actionsRef.current.next());
    set("previoustrack", () => actionsRef.current.previous());
    set("seekto", (details) => {
      if (typeof details.seekTime === "number") actionsRef.current.seek(details.seekTime);
    });
    set("seekbackward", (details) =>
      actionsRef.current.seek(stateRef.current.position - (details.seekOffset ?? 10)),
    );
    set("seekforward", (details) =>
      actionsRef.current.seek(stateRef.current.position + (details.seekOffset ?? 10)),
    );

    return () => {
      for (const action of actions) set(action, null);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const duration = current?.duration ?? 0;
    if (duration > 0 && Number.isFinite(state.position) && "setPositionState" in session) {
      try {
        session.setPositionState({
          duration,
          position: Math.min(Math.max(state.position, 0), duration),
          playbackRate: state.rate,
        });
      } catch {
        // Ignore an inconsistent position rather than throwing.
      }
    }
  }, [current, state.position, state.rate]);

  const api = useMemo<PlayerApi>(() => {
    const upNext = state.order
      .slice(state.cursor + 1)
      .flatMap((index) => (state.queue[index] ? [state.queue[index]] : []));

    return {
      state,
      current,
      upNext,
      engine,
      resolverAvailable,
      play,
      toggle: () => dispatch({ type: "toggle" }),
      next: () => dispatch({ type: "next", manual: true }),
      previous: () => dispatch({ type: "previous" }),
      seek,
      setVolume: (value) => dispatch({ type: "volume", value }),
      toggleMute: () => dispatch({ type: "toggle-mute" }),
      toggleShuffle: () => dispatch({ type: "shuffle" }),
      cycleRepeat: () => dispatch({ type: "repeat" }),
      toggleLike,
      syncLiked,
      appendRadio,
      toggleAutoplay,
      enqueue,
      dequeue,
      moveQueued,
      clearUpcoming,
      jump,
      setRate,
      setCrossfade,
      sleep,
      startSleep: startMinutes,
      sleepAtEndOfTrack,
      cancelSleep,
      notice,
      noticeTone,
      dismissNotice,
      notify: flash,
      isLiked: (id) => state.liked.includes(id),
      isCurrent: (id) => (state.queue[state.order[state.cursor]]?.id ?? null) === id,
    };
  }, [
    state,
    current,
    engine,
    resolverAvailable,
    play,
    seek,
    toggleLike,
    syncLiked,
    appendRadio,
    toggleAutoplay,
    enqueue,
    dequeue,
    moveQueued,
    clearUpcoming,
    jump,
    setRate,
    setCrossfade,
    sleep,
    startMinutes,
    sleepAtEndOfTrack,
    cancelSleep,
    notice,
    noticeTone,
    dismissNotice,
    flash,
  ]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return value;
}

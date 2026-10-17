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
import type { PlayerState, RepeatMode, Track } from "../types";
import { isDesktop } from "../lib/auth";
import { rateTrack, resolveStream, resolverStatus } from "../lib/music";

/**
 * The playback state machine, plus the audio sink.
 *
 * The reducer is pure and backend-agnostic. Two sinks drive it:
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

type Action =
  | { type: "play"; queue: Track[]; startIndex: number }
  | { type: "toggle" }
  | { type: "tick"; delta: number }
  | { type: "sync"; position: number }
  | { type: "duration"; duration: number }
  | { type: "seek"; position: number }
  | { type: "next"; manual: boolean }
  | { type: "previous" }
  | { type: "ended" }
  | { type: "volume"; value: number }
  | { type: "toggle-mute" }
  | { type: "shuffle" }
  | { type: "repeat" }
  | { type: "like"; id: string }
  | { type: "sync-liked"; ids: string[] };

const STORAGE_KEY = "ytm-desktop:preferences";

function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

/** Fisher-Yates, seeded from the current track so the transition is continuous. */
function shuffledOrder(length: number, keepAt: number): number[] {
  const order = identityOrder(length);
  const [keep] = order.splice(keepAt, 1);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return [keep, ...order];
}

type Preferences = { volume: number; repeat: RepeatMode; liked: string[] };

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : 0.7,
      repeat: parsed.repeat === "all" || parsed.repeat === "one" ? parsed.repeat : "off",
      liked: Array.isArray(parsed.liked) ? parsed.liked : [],
    };
  } catch {
    return { volume: 0.7, repeat: "off", liked: [] };
  }
}

function initialState(): PlayerState {
  const preferences = loadPreferences();
  return {
    queue: [],
    order: [],
    cursor: 0,
    isPlaying: false,
    position: 0,
    volume: preferences.volume,
    muted: false,
    shuffle: false,
    repeat: preferences.repeat,
    liked: preferences.liked,
    playToken: 0,
  };
}

function currentTrack(state: PlayerState): Track | null {
  return state.queue[state.order[state.cursor]] ?? null;
}

/** Advances the cursor. Returns null when the queue is exhausted and repeat is off. */
function step(state: PlayerState, direction: 1 | -1): number | null {
  const size = state.order.length;
  if (size === 0) return null;
  const next = state.cursor + direction;
  if (next >= 0 && next < size) return next;
  if (state.repeat === "all") return (next + size) % size;
  return null;
}

function reducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case "play": {
      const size = action.queue.length;
      if (size === 0) return state;
      const order = state.shuffle ? shuffledOrder(size, action.startIndex) : identityOrder(size);
      return {
        ...state,
        queue: action.queue,
        order,
        cursor: state.shuffle ? 0 : action.startIndex,
        isPlaying: true,
        position: 0,
        // Bumped so replaying the current track reloads its audio element.
        playToken: state.playToken + 1,
      };
    }

    case "toggle":
      return state.queue.length === 0 ? state : { ...state, isPlaying: !state.isPlaying };

    case "tick": {
      const track = currentTrack(state);
      if (!track || !state.isPlaying) return state;
      const position = state.position + action.delta;
      // A track whose duration the API omitted (`0`) must not auto-advance on
      // every tick; it just plays on until the real element reports a length.
      if (track.duration <= 0 || position < track.duration) return { ...state, position };

      if (state.repeat === "one") return { ...state, position: 0 };

      const next = step(state, 1);
      if (next === null) {
        // End of queue, repeat off: park on the last track, paused.
        return { ...state, isPlaying: false, position: track.duration };
      }
      return { ...state, cursor: next, position: 0 };
    }

    /** The real audio element reporting its playhead. */
    case "sync":
      return { ...state, position: action.position };

    /** The real audio element reporting its duration, which the API omits. */
    case "duration": {
      const index = state.order[state.cursor];
      const track = state.queue[index];
      if (!track || !Number.isFinite(action.duration) || track.duration === action.duration) {
        return state;
      }
      const queue = state.queue.slice();
      queue[index] = { ...track, duration: action.duration };
      return { ...state, queue };
    }

    case "seek": {
      const track = currentTrack(state);
      if (!track) return state;
      const max = track.duration > 0 ? track.duration : Number.POSITIVE_INFINITY;
      const position = Math.min(Math.max(action.position, 0), max);
      return { ...state, position };
    }

    case "next": {
      if (action.manual && state.repeat === "one") {
        return { ...state, position: 0 };
      }
      const next = step(state, 1);
      if (next === null) return state;
      return { ...state, cursor: next, position: 0, isPlaying: true };
    }

    case "previous": {
      if (state.position > 3) return { ...state, position: 0 };
      const previous = step(state, -1);
      if (previous === null) return { ...state, position: 0 };
      return { ...state, cursor: previous, position: 0, isPlaying: true };
    }

    /** The real audio element finishing a track. */
    case "ended": {
      if (state.repeat === "one") return { ...state, position: 0 };
      const next = step(state, 1);
      if (next === null) return { ...state, isPlaying: false, position: 0 };
      // A one-track queue under repeat-all lands on the same cursor; bump the
      // token so the load effect restarts the element instead of going silent.
      if (next === state.cursor) return { ...state, position: 0, playToken: state.playToken + 1 };
      return { ...state, cursor: next, position: 0, isPlaying: true };
    }

    case "volume":
      return { ...state, volume: action.value, muted: action.value === 0 ? state.muted : false };

    case "toggle-mute":
      return { ...state, muted: !state.muted };

    case "shuffle": {
      const shuffle = !state.shuffle;
      if (state.queue.length === 0) return { ...state, shuffle };
      const current = state.order[state.cursor];
      return {
        ...state,
        shuffle,
        order: shuffle ? shuffledOrder(state.queue.length, state.cursor) : identityOrder(state.queue.length),
        cursor: shuffle ? 0 : current,
      };
    }

    case "repeat": {
      const cycle: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
      return { ...state, repeat: cycle[state.repeat] };
    }

    case "like": {
      const liked = state.liked.includes(action.id)
        ? state.liked.filter((id) => id !== action.id)
        : [...state.liked, action.id];
      return { ...state, liked };
    }

    /** Seeds the local liked set from the account's liked songs. */
    case "sync-liked": {
      const merged = Array.from(new Set([...state.liked, ...action.ids]));
      return merged.length === state.liked.length ? state : { ...state, liked: merged };
    }
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
  /** Dismissible, short-lived message (e.g. a failed account write). */
  notice: string | null;
  dismissNotice: () => void;
  isLiked: (id: string) => boolean;
  isCurrent: (id: string) => boolean;
};

const PlayerContext = createContext<PlayerApi | null>(null);

/** Tick resolution: fine enough for a smooth scrubber, coarse enough to stay cheap. */
const TICK_MS = 250;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [engine, setEngine] = useState<PlaybackEngine>("sim");
  const [resolverAvailable, setResolverAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

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

  // Load (or reload) the real stream whenever the track — or a replay — changes.
  useEffect(() => {
    if (!useRealAudio || !currentId) return;

    let cancelled = false;
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    setEngine("sim");

    const onTime = () => dispatch({ type: "sync", position: audio.currentTime });
    const onMeta = () => {
      dispatch({ type: "duration", duration: audio.duration });
      // Metadata loaded: the element can actually play, so claim real audio.
      setEngine("audio");
    };
    const onError = () => {
      // A dead or rejected stream must not leave the UI stuck on a silent
      // "playing" state — fall back to the simulated transport.
      if (!cancelled) setEngine("sim");
    };
    const onEnded = () => {
      const latest = stateRef.current;
      dispatch({ type: "ended" });
      if (latest.repeat === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);

    void (async () => {
      try {
        const info = await resolveStream(currentId);
        if (cancelled) return;
        audio.volume = stateRef.current.volume;
        audio.muted = stateRef.current.muted;
        audio.src = info.url;
        audio.load();
        if (stateRef.current.isPlaying) {
          // A rejected `play()` means no real sound: degrade to the simulation.
          await audio.play().catch(() => {
            if (!cancelled) setEngine("sim");
          });
        }
      } catch {
        // No real stream available (yt-dlp missing, offline): the simulated
        // transport takes over instead of leaving the user with a dead player.
        if (!cancelled) setEngine("sim");
      }
    })();

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
  }, [currentId, state.playToken, useRealAudio]);

  // Play/pause is driven by the real element when one is loaded.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || engine !== "audio") return;
    if (state.isPlaying) void audio.play().catch(() => {});
    else audio.pause();
  }, [state.isPlaying, engine]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.volume;
    audio.muted = state.muted;
  }, [state.volume, state.muted, engine]);

  // Simulated tick — only while no real audio is driving the playhead.
  useEffect(() => {
    if (!state.isPlaying || engine === "audio") return;
    const timer = window.setInterval(() => {
      dispatch({ type: "tick", delta: TICK_MS / 1000 });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.isPlaying, engine]);

  useEffect(() => {
    const preferences: Preferences = {
      volume: state.volume,
      repeat: state.repeat,
      liked: state.liked,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Private mode / quota: preferences are a nicety, never a failure.
    }
  }, [state.volume, state.repeat, state.liked]);

  const play = useCallback((queue: Track[], startIndex = 0) => {
    dispatch({ type: "play", queue, startIndex });
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
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
          flash("Não foi possível salvar a curtida na conta.");
        });
    },
    [flash],
  );

  const syncLiked = useCallback((ids: string[]) => {
    if (ids.length > 0) dispatch({ type: "sync-liked", ids });
  }, []);

  const dismissNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.currentTime = seconds;
      } catch {
        // Not seekable yet; the reducer still moves the scrubber.
      }
    }
    dispatch({ type: "seek", position: seconds });
  }, []);

  // --- OS media integration (media keys, the system overlay) ---------------
  // The sign-in screen promises background playback with native controls; this
  // is what delivers it, via the Media Session API that Chromium/WebView2 expos.
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
          playbackRate: 1,
        });
      } catch {
        // Ignore an inconsistent position rather than throwing.
      }
    }
  }, [current, state.position]);

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
      notice,
      dismissNotice,
      isLiked: (id) => state.liked.includes(id),
      isCurrent: (id) => (state.queue[state.order[state.cursor]]?.id ?? null) === id,
    };
  }, [state, current, engine, resolverAvailable, play, seek, toggleLike, syncLiked, notice, dismissNotice]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return value;
}

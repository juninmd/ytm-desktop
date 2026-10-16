import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { PlayerState, RepeatMode, Track } from "../types";

/**
 * Backend-agnostic playback state machine. Every action is pure; the real
 * audio sink (a YouTube IFrame or an mpv sidecar) only needs to react to
 * `current` + `isPlaying` + `seekTo`.
 */

type Action =
  | { type: "play"; queue: Track[]; startIndex: number }
  | { type: "toggle" }
  | { type: "tick"; delta: number }
  | { type: "seek"; position: number }
  | { type: "next"; manual: boolean }
  | { type: "previous" }
  | { type: "volume"; value: number }
  | { type: "toggle-mute" }
  | { type: "shuffle" }
  | { type: "repeat" }
  | { type: "like"; id: string };

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
      };
    }

    case "toggle":
      return state.queue.length === 0 ? state : { ...state, isPlaying: !state.isPlaying };

    case "tick": {
      const track = currentTrack(state);
      if (!track || !state.isPlaying) return state;
      const position = state.position + action.delta;
      if (position < track.duration) return { ...state, position };

      if (state.repeat === "one") return { ...state, position: 0 };

      const next = step(state, 1);
      if (next === null) {
        // End of queue, repeat off: park on the last track, paused.
        return { ...state, isPlaying: false, position: track.duration };
      }
      return { ...state, cursor: next, position: 0 };
    }

    case "seek": {
      const track = currentTrack(state);
      if (!track) return state;
      const position = Math.min(Math.max(action.position, 0), track.duration);
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
  }
}

export type PlayerApi = {
  state: PlayerState;
  current: Track | null;
  upNext: Track[];
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
  isLiked: (id: string) => boolean;
  isCurrent: (id: string) => boolean;
};

const PlayerContext = createContext<PlayerApi | null>(null);

/** Tick resolution: fine enough for a smooth scrubber, coarse enough to stay cheap. */
const TICK_MS = 250;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    if (!state.isPlaying) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "tick", delta: TICK_MS / 1000 });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.isPlaying]);

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

  const api = useMemo<PlayerApi>(() => {
    const current = state.queue[state.order[state.cursor]] ?? null;
    const upNext = state.order
      .slice(state.cursor + 1)
      .flatMap((index) => (state.queue[index] ? [state.queue[index]] : []));

    return {
      state,
      current,
      upNext,
      play,
      toggle: () => dispatch({ type: "toggle" }),
      next: () => dispatch({ type: "next", manual: true }),
      previous: () => dispatch({ type: "previous" }),
      seek: (seconds) => dispatch({ type: "seek", position: seconds }),
      setVolume: (value) => dispatch({ type: "volume", value }),
      toggleMute: () => dispatch({ type: "toggle-mute" }),
      toggleShuffle: () => dispatch({ type: "shuffle" }),
      cycleRepeat: () => dispatch({ type: "repeat" }),
      toggleLike: (id) => dispatch({ type: "like", id }),
      isLiked: (id) => state.liked.includes(id),
      isCurrent: (id) => (state.queue[state.order[state.cursor]]?.id ?? null) === id,
    };
  }, [state, play]);

  return <PlayerContext.Provider value={api}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return value;
}

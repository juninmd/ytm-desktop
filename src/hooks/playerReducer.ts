import type { PlayerState, RepeatMode, Track } from "../types";

/**
 * The playback state machine, kept free of React (and of every browser API) so
 * it can be unit-tested directly. `usePlayer` owns the reducer, the audio sink
 * and the OS media integration; this module owns only the pure transitions.
 */

export type Action =
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
  | { type: "sync-liked"; ids: string[] }
  | { type: "append"; tracks: Track[] }
  | { type: "autoplay" };

export type Preferences = {
  volume: number;
  repeat: RepeatMode;
  liked: string[];
  autoplay: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  volume: 0.7,
  repeat: "off",
  liked: [],
  autoplay: true,
};

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

export function createInitialState(preferences: Preferences = DEFAULT_PREFERENCES): PlayerState {
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
    needsRadio: false,
    autoplay: preferences.autoplay,
  };
}

export function currentTrack(state: PlayerState): Track | null {
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

export function reducer(state: PlayerState, action: Action): PlayerState {
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
        needsRadio: false,
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
        // End of queue, repeat off: park on the last track, paused. If autoplay
        // is on, ask for a radio so the music does not just stop.
        return {
          ...state,
          isPlaying: false,
          position: track.duration,
          needsRadio: state.autoplay,
        };
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
      if (next === null) return { ...state, needsRadio: state.autoplay };
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
      if (next === null) {
        return { ...state, isPlaying: false, position: 0, needsRadio: state.autoplay };
      }
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
        order: shuffle
          ? shuffledOrder(state.queue.length, state.cursor)
          : identityOrder(state.queue.length),
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

    /**
     * Appends a radio (or any extra tracks) to the queue and jumps to the first
     * of them. Used when the queue runs out and autoplay is on.
     */
    case "append": {
      if (action.tracks.length === 0) return { ...state, needsRadio: false };
      const base = state.queue.length;
      const queue = [...state.queue, ...action.tracks];
      const order = [...state.order, ...action.tracks.map((_, index) => base + index)];
      return {
        ...state,
        queue,
        order,
        cursor: base,
        position: 0,
        isPlaying: true,
        needsRadio: false,
        playToken: state.playToken + 1,
      };
    }

    case "autoplay":
      return { ...state, autoplay: !state.autoplay, needsRadio: false };
  }
}

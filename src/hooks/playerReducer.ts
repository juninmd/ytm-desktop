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
  | { type: "autoplay" }
  | { type: "enqueue"; tracks: Track[]; where: "next" | "last" }
  /** Drops an upcoming entry; `position` indexes `order`, like `jump` and `move`. */
  | { type: "dequeue"; position: number }
  | { type: "move"; from: number; to: number }
  | { type: "clear-upcoming" }
  | { type: "jump"; position: number }
  | { type: "pause" }
  | { type: "rate"; value: number }
  | { type: "stop-after"; value: boolean };

export type Preferences = {
  volume: number;
  repeat: RepeatMode;
  liked: string[];
  autoplay: boolean;
  rate: number;
  /** The previous session, so the player can offer to continue where it stopped. */
  session?: Session;
};

export type Session = {
  queue: Track[];
  cursor: number;
  position: number;
  shuffle: boolean;
  savedAt: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  volume: 0.7,
  repeat: "off",
  liked: [],
  autoplay: true,
  rate: 1,
};

export const MIN_RATE = 0.25;
export const MAX_RATE = 3;

/** Speeds offered in the UI; the reducer accepts anything within the bounds. */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** How many tracks of a session are kept for the next launch. */
export const MAX_RESUME_TRACKS = 200;

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

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function createInitialState(preferences: Preferences = DEFAULT_PREFERENCES): PlayerState {
  const base = {
    volume: preferences.volume,
    muted: false,
    repeat: preferences.repeat,
    liked: preferences.liked,
    playToken: 0,
    needsRadio: false,
    autoplay: preferences.autoplay,
    rate: clamp(preferences.rate, MIN_RATE, MAX_RATE),
    stopAfterTrack: false,
  };

  const session = preferences.session;
  if (session && session.queue.length > 0) {
    const cursor = clamp(Math.round(session.cursor), 0, session.queue.length - 1);
    const track = session.queue[cursor];
    const limit = track && track.duration > 0 ? track.duration : Number.POSITIVE_INFINITY;
    return {
      ...base,
      queue: session.queue,
      order: identityOrder(session.queue.length),
      cursor,
      // Resumed paused, so a launch never blasts audio at the user.
      isPlaying: false,
      position: clamp(session.position, 0, limit),
      shuffle: session.shuffle,
    };
  }

  return {
    ...base,
    queue: [],
    order: [],
    cursor: 0,
    isPlaying: false,
    position: 0,
    shuffle: false,
  };
}

export function currentTrack(state: PlayerState): Track | null {
  return state.queue[state.order[state.cursor]] ?? null;
}

/** How far behind the cursor a truncated session keeps, so "previous" still works. */
const RESUME_LOOKBEHIND = 20;

/**
 * The session to persist. The queue is written in *play order*, because the
 * restored state rebuilds `order` as the identity: that keeps shuffle and the
 * user's own queue edits intact across a restart.
 */
export function snapshotSession(state: PlayerState): Session | undefined {
  if (state.queue.length === 0) return undefined;
  const ordered = state.order.flatMap((index) => (state.queue[index] ? [state.queue[index]] : []));
  const start = Math.max(
    0,
    Math.min(state.cursor - RESUME_LOOKBEHIND, ordered.length - MAX_RESUME_TRACKS),
  );
  return {
    queue: ordered.slice(start, start + MAX_RESUME_TRACKS),
    cursor: state.cursor - start,
    position: state.position,
    shuffle: state.shuffle,
    savedAt: Date.now(),
  };
}

/**
 * Moves to `cursor` and plays. When the destination is the same track (a
 * duplicate in the queue) the token is bumped, because the audio element only
 * reloads when the track id or the token changes.
 */
function arrive(state: PlayerState, cursor: number): PlayerState {
  const target = state.queue[state.order[cursor]];
  const same = target !== undefined && target.id === currentTrack(state)?.id;
  return {
    ...state,
    cursor,
    position: 0,
    isPlaying: true,
    playToken: same ? state.playToken + 1 : state.playToken,
  };
}

/** A track played to its end, from either the real element or the simulation. */
function finishTrack(state: PlayerState, track: Track): PlayerState {
  if (state.stopAfterTrack) {
    // The sleep timer's "end of track": park on whatever comes next, paused.
    const next = step(state, 1);
    return {
      ...state,
      cursor: next ?? state.cursor,
      isPlaying: false,
      position: 0,
      stopAfterTrack: false,
      needsRadio: false,
      playToken: state.playToken + 1,
    };
  }
  if (state.repeat === "one") return { ...state, position: 0 };

  const next = step(state, 1);
  if (next === null) {
    // End of queue, repeat off: if autoplay is on, ask for a radio so the
    // music does not just stop.
    return { ...state, isPlaying: false, position: track.duration, needsRadio: state.autoplay };
  }
  return arrive(state, next);
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
        stopAfterTrack: false,
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
      return finishTrack(state, track);
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
      return arrive(state, next);
    }

    case "previous": {
      if (state.position > 3) return { ...state, position: 0 };
      const previous = step(state, -1);
      if (previous === null) return { ...state, position: 0 };
      return arrive(state, previous);
    }

    /** The real audio element finishing a track. */
    case "ended": {
      const track = currentTrack(state);
      if (!track) return state;
      if (!state.stopAfterTrack && state.repeat !== "one" && step(state, 1) === null) {
        return { ...state, isPlaying: false, position: 0, needsRadio: state.autoplay };
      }
      // A one-track queue under repeat-all lands on the same cursor; `arrive`
      // bumps the token so the load effect restarts the element.
      return finishTrack(state, track);
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
          ? shuffledOrder(state.queue.length, current)
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

    case "enqueue": {
      if (action.tracks.length === 0) return state;
      // Nothing to queue behind: queueing into silence just starts playing.
      if (state.queue.length === 0) {
        return reducer(state, { type: "play", queue: action.tracks, startIndex: 0 });
      }
      // Parked at the end waiting for a radio: the queued tracks are the answer.
      if (state.needsRadio) return reducer(state, { type: "append", tracks: action.tracks });
      const base = state.queue.length;
      const added = action.tracks.map((_, index) => base + index);
      const at = action.where === "next" ? state.cursor + 1 : state.order.length;
      return {
        ...state,
        queue: [...state.queue, ...action.tracks],
        order: [...state.order.slice(0, at), ...added, ...state.order.slice(at)],
        needsRadio: false,
      };
    }

    case "dequeue": {
      if (!isUpcoming(state, action.position)) return state;
      const removed = state.order[action.position];
      return {
        ...state,
        queue: state.queue.filter((_, index) => index !== removed),
        order: state.order
          .filter((_, position) => position !== action.position)
          .map((index) => (index > removed ? index - 1 : index)),
      };
    }

    case "move": {
      if (!isUpcoming(state, action.from) || !isUpcoming(state, action.to)) return state;
      if (action.from === action.to) return state;
      const order = state.order.slice();
      const [moved] = order.splice(action.from, 1);
      order.splice(action.to, 0, moved);
      return { ...state, order };
    }

    case "clear-upcoming": {
      if (state.order.length <= state.cursor + 1) return state;
      return {
        ...state,
        queue: state.order.slice(0, state.cursor + 1).map((index) => state.queue[index]),
        order: identityOrder(state.cursor + 1),
        needsRadio: false,
      };
    }

    case "jump": {
      if (action.position < 0 || action.position >= state.order.length) return state;
      const landed = arrive(state, action.position);
      return { ...landed, needsRadio: false, playToken: state.playToken + 1 };
    }

    case "pause":
      return state.isPlaying ? { ...state, isPlaying: false } : state;

    case "rate":
      return { ...state, rate: clamp(action.value, MIN_RATE, MAX_RATE) };

    case "stop-after":
      return { ...state, stopAfterTrack: action.value };
  }
}

/** Whether `position` points at something still to come (not the playing track). */
function isUpcoming(state: PlayerState, position: number): boolean {
  return Number.isInteger(position) && position > state.cursor && position < state.order.length;
}

/** The next preset speed above or below `rate` (clamped at the ends). */
export function nextRate(rate: number, direction: 1 | -1): number {
  if (direction === 1) return RATES.find((preset) => preset > rate + 1e-9) ?? RATES[RATES.length - 1];
  return [...RATES].reverse().find((preset) => preset < rate - 1e-9) ?? RATES[0];
}

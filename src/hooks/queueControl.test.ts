import { describe, expect, it } from "vitest";
import {
  createInitialState,
  currentTrack,
  MAX_RESUME_TRACKS,
  nextRate,
  reducer,
  snapshotSession,
  type Preferences,
} from "./playerReducer";
import type { PlayerState, Track } from "../types";

const track = (id: string, duration = 100): Track => ({
  id,
  title: id,
  artist: "Artist",
  album: "Album",
  albumId: "album",
  duration,
  year: 2020,
  plays: "",
});

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  volume: 0.7,
  repeat: "off",
  liked: [],
  autoplay: true,
  rate: 1,
  ...overrides,
});

const ids = (state: PlayerState) => state.order.map((index) => state.queue[index].id);

/** a, b, c, d queued, playing `a`. */
function playing(shuffle = false): PlayerState {
  let state = createInitialState(prefs());
  if (shuffle) state = reducer(state, { type: "shuffle" });
  return reducer(state, {
    type: "play",
    queue: ["a", "b", "c", "d"].map((id) => track(id)),
    startIndex: 0,
  });
}

describe("queue editing", () => {
  it("plays a track next, right after the current one", () => {
    const state = reducer(playing(), { type: "enqueue", tracks: [track("x")], where: "next" });
    expect(ids(state)).toEqual(["a", "x", "b", "c", "d"]);
    expect(currentTrack(state)?.id).toBe("a");
  });

  it("adds tracks to the end of the queue", () => {
    const state = reducer(playing(), {
      type: "enqueue",
      tracks: [track("x"), track("y")],
      where: "last",
    });
    expect(ids(state)).toEqual(["a", "b", "c", "d", "x", "y"]);
  });

  it("keeps the current track playing while the queue grows", () => {
    const before = playing();
    const after = reducer(before, { type: "enqueue", tracks: [track("x")], where: "next" });
    expect(after.playToken).toBe(before.playToken);
    expect(after.isPlaying).toBe(true);
  });

  it("starts playing when queueing into an empty player", () => {
    const state = reducer(createInitialState(prefs()), {
      type: "enqueue",
      tracks: [track("x")],
      where: "last",
    });
    expect(currentTrack(state)?.id).toBe("x");
    expect(state.isPlaying).toBe(true);
  });

  it("queues a track next while shuffled without disturbing the rest", () => {
    const before = playing(true);
    const after = reducer(before, { type: "enqueue", tracks: [track("x")], where: "next" });
    expect(ids(after)).toEqual([ids(before)[0], "x", ...ids(before).slice(1)]);
  });

  it("removes an upcoming track and reindexes the rest", () => {
    const state = reducer(playing(), { type: "dequeue", position: 2 });
    expect(ids(state)).toEqual(["a", "b", "d"]);
    expect(state.queue.map((item) => item.id)).toEqual(["a", "b", "d"]);
  });

  it("refuses to remove the playing or an already played track", () => {
    const state = reducer(playing(), { type: "next", manual: true }); // now on b
    expect(reducer(state, { type: "dequeue", position: 1 })).toBe(state);
    expect(reducer(state, { type: "dequeue", position: 0 })).toBe(state);
    expect(reducer(state, { type: "dequeue", position: 99 })).toBe(state);
  });

  it("moves an upcoming track and leaves the current one alone", () => {
    const state = reducer(playing(), { type: "move", from: 3, to: 1 });
    expect(ids(state)).toEqual(["a", "d", "b", "c"]);
    expect(currentTrack(state)?.id).toBe("a");
  });

  it("will not move a track above the playing one", () => {
    const before = playing();
    expect(reducer(before, { type: "move", from: 2, to: 0 })).toBe(before);
  });

  it("clears everything after the current track", () => {
    let state = reducer(playing(), { type: "next", manual: true }); // on b
    state = reducer(state, { type: "clear-upcoming" });
    expect(ids(state)).toEqual(["a", "b"]);
    expect(currentTrack(state)?.id).toBe("b");
    // "previous" still has somewhere to go.
    expect(reducer({ ...state, position: 0 }, { type: "previous" }).cursor).toBe(0);
  });

  it("jumps to a queue position without rebuilding the order", () => {
    let state = reducer(playing(), { type: "enqueue", tracks: [track("x")], where: "next" });
    state = reducer(state, { type: "jump", position: 1 });
    expect(currentTrack(state)?.id).toBe("x");
    expect(ids(state)).toEqual(["a", "x", "b", "c", "d"]);
    expect(state.isPlaying).toBe(true);
  });

  it("reloads the audio when the next entry is the same track again", () => {
    let state = reducer(playing(), { type: "enqueue", tracks: [track("a")], where: "next" });
    const token = state.playToken;
    state = reducer(state, { type: "next", manual: true });
    expect(currentTrack(state)?.id).toBe("a");
    expect(state.playToken).toBe(token + 1);
  });
});

describe("queue edits meeting shuffle and the autoplay radio", () => {
  it("keeps the playing track when shuffle is switched on after a play-next", () => {
    let state = reducer(playing(), { type: "enqueue", tracks: [track("x")], where: "next" });
    state = reducer(state, { type: "next", manual: true }); // x is playing
    expect(currentTrack(state)?.id).toBe("x");
    state = reducer(state, { type: "shuffle" });
    expect(currentTrack(state)?.id).toBe("x");
    expect(state.cursor).toBe(0);
    state = reducer(state, { type: "shuffle" });
    expect(currentTrack(state)?.id).toBe("x");
  });

  it("starts the queued track when the player is stopped waiting for a radio", () => {
    let state = reducer(playing(), { type: "jump", position: 3 });
    state = reducer(state, { type: "ended" }); // end of queue: needsRadio
    expect(state.needsRadio).toBe(true);
    state = reducer(state, { type: "enqueue", tracks: [track("x")], where: "next" });
    expect(currentTrack(state)?.id).toBe("x");
    expect(state.isPlaying).toBe(true);
    expect(state.needsRadio).toBe(false);
  });
});

describe("playback speed", () => {
  it("clamps the rate to the supported range", () => {
    const state = playing();
    expect(reducer(state, { type: "rate", value: 1.5 }).rate).toBe(1.5);
    expect(reducer(state, { type: "rate", value: 99 }).rate).toBe(3);
    expect(reducer(state, { type: "rate", value: 0 }).rate).toBe(0.25);
    expect(reducer(state, { type: "rate", value: Number.NaN }).rate).toBe(0.25);
  });

  it("steps through the preset speeds and stops at the ends", () => {
    expect(nextRate(1, 1)).toBe(1.25);
    expect(nextRate(1, -1)).toBe(0.75);
    expect(nextRate(2, 1)).toBe(2);
    expect(nextRate(0.5, -1)).toBe(0.5);
    // Off-preset speeds (e.g. restored from an older build) snap to a neighbour.
    expect(nextRate(1.1, 1)).toBe(1.25);
    expect(nextRate(1.1, -1)).toBe(1);
  });

  it("restores the stored rate, bounded", () => {
    expect(createInitialState(prefs({ rate: 1.25 })).rate).toBe(1.25);
    expect(createInitialState(prefs({ rate: 40 })).rate).toBe(3);
  });
});

describe("stop after this track", () => {
  const armed = () => reducer(playing(), { type: "stop-after", value: true });

  it("pauses on the next track instead of continuing", () => {
    const state = reducer(armed(), { type: "ended" });
    expect(state.isPlaying).toBe(false);
    expect(currentTrack(state)?.id).toBe("b");
    expect(state.stopAfterTrack).toBe(false);
    expect(state.position).toBe(0);
  });

  it("also stops when the simulated playhead reaches the end", () => {
    const state = reducer(armed(), { type: "tick", delta: 100 });
    expect(state.isPlaying).toBe(false);
    expect(state.stopAfterTrack).toBe(false);
  });

  it("wins over repeat-one and over the autoplay radio", () => {
    let state = reducer({ ...armed(), repeat: "one" }, { type: "ended" });
    expect(state.isPlaying).toBe(false);

    state = reducer(playing(), { type: "jump", position: 3 });
    state = reducer({ ...state, stopAfterTrack: true }, { type: "ended" });
    expect(state.isPlaying).toBe(false);
    expect(state.needsRadio).toBe(false);
  });

  it("ignores a manual skip, and is dropped by a fresh play", () => {
    const skipped = reducer(armed(), { type: "next", manual: true });
    expect(skipped.stopAfterTrack).toBe(true);
    expect(skipped.isPlaying).toBe(true);

    const fresh = reducer(armed(), { type: "play", queue: [track("z")], startIndex: 0 });
    expect(fresh.stopAfterTrack).toBe(false);
  });

  it("pauses idempotently", () => {
    const state = reducer(playing(), { type: "pause" });
    expect(state.isPlaying).toBe(false);
    expect(reducer(state, { type: "pause" })).toBe(state);
  });
});

describe("session snapshot", () => {
  it("writes the queue in play order so edits and shuffle survive a restart", () => {
    let state = reducer(playing(), { type: "enqueue", tracks: [track("x")], where: "next" });
    state = reducer(state, { type: "next", manual: true }); // on x
    const session = snapshotSession(state);
    expect(session?.queue.map((item) => item.id)).toEqual(["a", "x", "b", "c", "d"]);
    expect(session?.cursor).toBe(1);

    const restored = createInitialState(prefs({ session }));
    expect(currentTrack(restored)?.id).toBe("x");
    expect(restored.isPlaying).toBe(false);
  });

  it("returns nothing for an empty player", () => {
    expect(snapshotSession(createInitialState(prefs()))).toBeUndefined();
  });

  it("keeps the playing track inside a truncated window", () => {
    const big = Array.from({ length: MAX_RESUME_TRACKS + 300 }, (_, index) => track(`t${index}`));
    let state = reducer(createInitialState(prefs()), { type: "play", queue: big, startIndex: 450 });
    state = { ...state, position: 12 };
    const session = snapshotSession(state);
    expect(session?.queue).toHaveLength(MAX_RESUME_TRACKS);
    expect(session?.queue[session.cursor].id).toBe("t450");
    expect(session?.position).toBe(12);
  });
});

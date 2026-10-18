import { describe, expect, it } from "vitest";
import { createInitialState, currentTrack, reducer, type Preferences } from "./playerReducer";
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

const queue = [track("a"), track("b"), track("c")];

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({
  volume: 0.7,
  repeat: "off",
  liked: [],
  autoplay: true,
  ...overrides,
});

/** Plays a queue and returns the resulting state. */
function playing(state: PlayerState = createInitialState(prefs()), startIndex = 0) {
  return reducer(state, { type: "play", queue, startIndex });
}

describe("playback reducer", () => {
  it("starts playing a queue at the chosen index", () => {
    const state = playing(createInitialState(prefs()), 1);
    expect(currentTrack(state)?.id).toBe("b");
    expect(state.isPlaying).toBe(true);
    expect(state.position).toBe(0);
    expect(state.playToken).toBe(1);
  });

  it("ignores an empty queue", () => {
    const before = createInitialState(prefs());
    expect(reducer(before, { type: "play", queue: [], startIndex: 0 })).toBe(before);
  });

  it("keeps the chosen track first when shuffle is on", () => {
    const shuffled = reducer(createInitialState(prefs()), { type: "shuffle" });
    const state = playing(shuffled, 2);
    expect(currentTrack(state)?.id).toBe("c");
    expect(state.order).toHaveLength(3);
    expect(new Set(state.order).size).toBe(3);
  });

  it("advances the playhead and pauses at the end when repeat is off", () => {
    let state = playing(createInitialState(prefs()), 2); // last track
    state = reducer(state, { type: "tick", delta: 100 });
    expect(state.isPlaying).toBe(false);
    expect(state.position).toBe(100);
  });

  it("loops the same track under repeat one", () => {
    let state = reducer(playing(createInitialState(prefs({ repeat: "one" }))), { type: "tick", delta: 100 });
    expect(state.position).toBe(0);
    expect(currentTrack(state)?.id).toBe("a");
  });

  it("wraps to the first track under repeat all", () => {
    let state = playing(createInitialState(prefs({ repeat: "all" })), 2);
    state = reducer(state, { type: "tick", delta: 100 });
    expect(currentTrack(state)?.id).toBe("a");
  });

  it("does not auto-advance a track whose duration is unknown", () => {
    const unknown = [track("x", 0)];
    let state = reducer(createInitialState(prefs()), { type: "play", queue: unknown, startIndex: 0 });
    state = reducer(state, { type: "tick", delta: 1000 });
    expect(state.position).toBe(1000);
    expect(state.isPlaying).toBe(true);
    expect(state.cursor).toBe(0);
  });

  it("clamps a seek to the track duration but not when it is unknown", () => {
    const known = reducer(playing(), { type: "seek", position: 999 });
    expect(known.position).toBe(100);

    const unknownState = reducer(
      createInitialState(prefs()),
      { type: "play", queue: [track("x", 0)], startIndex: 0 },
    );
    expect(reducer(unknownState, { type: "seek", position: 500 }).position).toBe(500);
  });

  it("restarts the track on previous when past the intro", () => {
    let state = playing();
    state = reducer(state, { type: "tick", delta: 10 });
    state = reducer(state, { type: "previous" });
    expect(state.position).toBe(0);
    expect(currentTrack(state)?.id).toBe("a");
  });

  it("steps back to the previous track early in the song", () => {
    let state = playing(createInitialState(prefs()), 2);
    state = reducer(state, { type: "previous" });
    expect(currentTrack(state)?.id).toBe("b");
  });

  it("repeats the current track on a manual next under repeat one", () => {
    let state = playing(createInitialState(prefs({ repeat: "one" })));
    state = reducer(state, { type: "tick", delta: 5 });
    state = reducer(state, { type: "next", manual: true });
    expect(currentTrack(state)?.id).toBe("a");
    expect(state.position).toBe(0);
  });

  it("restarts the element when a one-track queue ends under repeat all", () => {
    const single = [track("solo")];
    let state = reducer(createInitialState(prefs({ repeat: "all" })), {
      type: "play",
      queue: single,
      startIndex: 0,
    });
    const token = state.playToken;
    state = reducer(state, { type: "ended" });
    expect(state.playToken).toBe(token + 1);
    expect(state.isPlaying).toBe(true);
  });

  it("pauses when the queue ends under repeat off", () => {
    let state = playing(createInitialState(prefs()), 2);
    state = reducer(state, { type: "ended" });
    expect(state.isPlaying).toBe(false);
  });

  it("keeps the same track selected when shuffle is toggled", () => {
    let state = playing(createInitialState(prefs()), 1);
    state = reducer(state, { type: "shuffle" });
    expect(state.shuffle).toBe(true);
    expect(currentTrack(state)?.id).toBe("b");
    state = reducer(state, { type: "shuffle" });
    expect(state.shuffle).toBe(false);
    expect(currentTrack(state)?.id).toBe("b");
  });

  it("cycles the repeat mode off -> all -> one -> off", () => {
    let state = createInitialState(prefs());
    state = reducer(state, { type: "repeat" });
    expect(state.repeat).toBe("all");
    state = reducer(state, { type: "repeat" });
    expect(state.repeat).toBe("one");
    state = reducer(state, { type: "repeat" });
    expect(state.repeat).toBe("off");
  });

  it("un-mutes when the volume is raised off zero", () => {
    let state = reducer(createInitialState(prefs()), { type: "toggle-mute" });
    expect(state.muted).toBe(true);
    state = reducer(state, { type: "volume", value: 0.5 });
    expect(state.muted).toBe(false);
    expect(state.volume).toBe(0.5);
  });

  it("toggles a like and seeds it from the account without duplicates", () => {
    let state = createInitialState(prefs());
    state = reducer(state, { type: "like", id: "a" });
    expect(state.liked).toEqual(["a"]);
    state = reducer(state, { type: "sync-liked", ids: ["a", "b"] });
    expect(state.liked).toEqual(["a", "b"]);
    state = reducer(state, { type: "like", id: "a" });
    expect(state.liked).toEqual(["b"]);
  });

  it("adopts the duration the real element reports", () => {
    const unknown = [track("x", 0)];
    let state = reducer(createInitialState(prefs()), { type: "play", queue: unknown, startIndex: 0 });
    state = reducer(state, { type: "duration", duration: 214.5 });
    expect(state.queue[0].duration).toBe(214.5);
  });

  it("asks for a radio when the queue ends with autoplay on", () => {
    let state = playing(createInitialState(prefs({ autoplay: true })), 2);
    state = reducer(state, { type: "ended" });
    expect(state.needsRadio).toBe(true);
    expect(state.isPlaying).toBe(false);

    const appended = reducer(state, { type: "append", tracks: [track("r1"), track("r2")] });
    expect(appended.queue).toHaveLength(5);
    expect(currentTrack(appended)?.id).toBe("r1");
    expect(appended.isPlaying).toBe(true);
    expect(appended.needsRadio).toBe(false);
  });

  it("stops without a radio when autoplay is off", () => {
    let state = playing(createInitialState(prefs({ autoplay: false })), 2);
    state = reducer(state, { type: "ended" });
    expect(state.needsRadio).toBe(false);
    expect(state.isPlaying).toBe(false);
  });

  it("clears the radio request when an append yields nothing", () => {
    const state = reducer(playing(createInitialState(prefs()), 2), { type: "ended" });
    expect(state.needsRadio).toBe(true);
    expect(reducer(state, { type: "append", tracks: [] }).needsRadio).toBe(false);
  });

  it("toggles autoplay and clears a pending radio request", () => {
    const state = reducer(playing(createInitialState(prefs()), 2), { type: "ended" });
    const toggled = reducer(state, { type: "autoplay" });
    expect(toggled.autoplay).toBe(false);
    expect(toggled.needsRadio).toBe(false);
  });

  it("restores a saved session paused, at the saved track and position", () => {
    const state = createInitialState(
      prefs({
        session: {
          queue: [track("a"), track("b"), track("c")],
          cursor: 1,
          position: 42,
          shuffle: true,
          savedAt: 1,
        },
      }),
    );

    expect(state.queue.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(currentTrack(state)?.id).toBe("b");
    expect(state.position).toBe(42);
    expect(state.shuffle).toBe(true);
    // A launch must never start audio on its own.
    expect(state.isPlaying).toBe(false);
  });

  it("clamps a restored cursor and position into range", () => {
    const state = createInitialState(
      prefs({
        session: {
          queue: [track("a", 100)],
          cursor: 9,
          position: 999,
          shuffle: false,
          savedAt: 1,
        },
      }),
    );
    expect(state.cursor).toBe(0);
    expect(state.position).toBe(100);
  });

  it("ignores a stored session with no tracks", () => {
    const state = createInitialState(
      prefs({ session: { queue: [], cursor: 0, position: 5, shuffle: false, savedAt: 1 } }),
    );
    expect(state.queue).toEqual([]);
    expect(state.position).toBe(0);
  });
});

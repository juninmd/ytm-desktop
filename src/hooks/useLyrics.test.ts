import { describe, expect, it } from "vitest";
import { activeLineIndex } from "./useLyrics";
import type { Lyrics } from "../lib/music";

const synced: Lyrics = {
  synced: true,
  source: "test",
  lines: [
    { time: 0, text: "one" },
    { time: 10, text: "two" },
    { time: 20, text: "three" },
  ],
};

describe("active lyric line", () => {
  it("is the last line at or before the playhead", () => {
    expect(activeLineIndex(synced, 0)).toBe(0);
    expect(activeLineIndex(synced, 9.7)).toBe(0);
    expect(activeLineIndex(synced, 10)).toBe(1);
    expect(activeLineIndex(synced, 999)).toBe(2);
  });

  it("looks a hair ahead so a line lights up as it starts", () => {
    expect(activeLineIndex(synced, 9.9)).toBe(1);
  });

  it("is -1 before the first timed line and for unsynced or missing lyrics", () => {
    expect(activeLineIndex({ ...synced, lines: [{ time: 5, text: "late" }] }, 1)).toBe(-1);
    expect(activeLineIndex({ ...synced, synced: false }, 12)).toBe(-1);
    expect(activeLineIndex(null, 12)).toBe(-1);
  });
});

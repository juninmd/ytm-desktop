import { describe, expect, it } from "vitest";
import { EMPTY_MAPS, mergeCatalog } from "./catalog";
import type { Collection, Track } from "../types";

const collection = (id: string, trackIds: string[] = []): Collection => ({
  id,
  kind: "album",
  format: "album",
  title: id,
  subtitle: "Artist",
  trackIds,
});

const track = (id: string): Track => ({
  id,
  title: id,
  artist: "Artist",
  album: "Album",
  albumId: "album",
  duration: 100,
  year: 2020,
  plays: "",
});

describe("mergeCatalog", () => {
  it("adds collections and tracks to an empty store", () => {
    const merged = mergeCatalog(EMPTY_MAPS, {
      collections: [collection("a", ["t1"])],
      tracks: [track("t1")],
    });
    expect(merged.collections.a.trackIds).toEqual(["t1"]);
    expect(merged.tracks.t1.title).toBe("t1");
  });

  it("keeps the richer collection when a bare card arrives later", () => {
    const first = mergeCatalog(EMPTY_MAPS, {
      collections: [collection("a", ["t1", "t2"])],
      tracks: [],
    });
    const merged = mergeCatalog(first, { collections: [collection("a")], tracks: [] });
    expect(merged.collections.a.trackIds).toEqual(["t1", "t2"]);
  });

  it("takes the richer collection when it arrives later", () => {
    const first = mergeCatalog(EMPTY_MAPS, { collections: [collection("a")], tracks: [] });
    const merged = mergeCatalog(first, {
      collections: [collection("a", ["t1"])],
      tracks: [],
    });
    expect(merged.collections.a.trackIds).toEqual(["t1"]);
  });

  it("skips collections without an id", () => {
    const merged = mergeCatalog(EMPTY_MAPS, {
      collections: [collection("")],
      tracks: [],
    });
    expect(Object.keys(merged.collections)).toEqual([]);
  });

  it("does not mutate the previous maps", () => {
    const first = mergeCatalog(EMPTY_MAPS, { collections: [collection("a")], tracks: [] });
    mergeCatalog(first, { collections: [collection("b")], tracks: [track("t1")] });
    expect(Object.keys(first.collections)).toEqual(["a"]);
    expect(first.tracks).toEqual({});
  });

  it("overwrites a track with the same id", () => {
    const first = mergeCatalog(EMPTY_MAPS, { collections: [], tracks: [track("t1")] });
    const merged = mergeCatalog(first, {
      collections: [],
      tracks: [{ ...track("t1"), title: "updated" }],
    });
    expect(merged.tracks.t1.title).toBe("updated");
  });
});

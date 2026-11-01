import { describe, expect, it } from "vitest";
import {
  crossfadeDurationMs,
  crossfadeGains,
  shouldStartCrossfade,
  type CrossfadeInput,
} from "./crossfade";

const base: CrossfadeInput = {
  seconds: 6,
  remaining: 5,
  nextReady: true,
  playing: true,
  repeatOne: false,
  stopAfterTrack: false,
  alreadyFading: false,
};

describe("crossfade curves", () => {
  it("hands over from one track to the other", () => {
    expect(crossfadeGains(0)).toEqual({ out: 1, in: 0 });
    expect(crossfadeGains(1).out).toBeCloseTo(0);
    expect(crossfadeGains(1).in).toBeCloseTo(1);
  });

  it("keeps the summed power constant through the overlap", () => {
    for (const progress of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const gain = crossfadeGains(progress);
      expect(gain.out ** 2 + gain.in ** 2).toBeCloseTo(1);
    }
    // A linear ramp would dip to 0.5 + 0.5 amplitude; equal power sits at ~0.707 each.
    expect(crossfadeGains(0.5).out).toBeCloseTo(Math.SQRT1_2);
  });

  it("clamps progress and survives bad input", () => {
    expect(crossfadeGains(-3)).toEqual({ out: 1, in: 0 });
    expect(crossfadeGains(9).in).toBeCloseTo(1);
    expect(crossfadeGains(Number.NaN)).toEqual({ out: 1, in: 0 });
  });
});

describe("when the overlap starts", () => {
  it("starts inside the window, once", () => {
    expect(shouldStartCrossfade(base)).toBe(true);
    expect(shouldStartCrossfade({ ...base, alreadyFading: true })).toBe(false);
    expect(shouldStartCrossfade({ ...base, remaining: 7 })).toBe(false);
  });

  it("stays off when crossfade is off, nothing is queued, or playback is paused", () => {
    expect(shouldStartCrossfade({ ...base, seconds: 0 })).toBe(false);
    expect(shouldStartCrossfade({ ...base, nextReady: false })).toBe(false);
    expect(shouldStartCrossfade({ ...base, playing: false })).toBe(false);
  });

  it("never overlaps a track that repeats or that the sleep timer ends", () => {
    expect(shouldStartCrossfade({ ...base, repeatOne: true })).toBe(false);
    expect(shouldStartCrossfade({ ...base, stopAfterTrack: true })).toBe(false);
  });

  it("leaves the last fraction of a second to the plain track change", () => {
    expect(shouldStartCrossfade({ ...base, remaining: 0.2 })).toBe(false);
    expect(shouldStartCrossfade({ ...base, remaining: Number.NaN })).toBe(false);
  });

  it("measures the overlap in wall-clock time, scaled by playback speed", () => {
    expect(crossfadeDurationMs(5, 6, 1)).toBe(5000);
    expect(crossfadeDurationMs(5, 6, 2)).toBe(2500);
    expect(crossfadeDurationMs(9, 6, 1)).toBe(6000);
    expect(crossfadeDurationMs(-1, 6, 1)).toBe(0);
  });
});

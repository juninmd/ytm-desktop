import { describe, expect, it } from "vitest";
import { fadeGain, FADE_SECONDS, formatRemaining, remainingMs, startSleepTimer } from "./sleepTimer";

describe("sleep timer", () => {
  it("expires after the chosen minutes, measured on the wall clock", () => {
    const timer = startSleepTimer(15, 1_000);
    expect(timer).toMatchObject({ kind: "minutes", endsAt: 901_000 });
    expect(remainingMs(timer, 1_000)).toBe(900_000);
    expect(remainingMs(timer, 901_000)).toBe(0);
    // A machine that slept past the deadline must read as expired, not negative.
    expect(remainingMs(timer, 5_000_000)).toBe(0);
  });

  it("has no countdown for the end-of-track variant", () => {
    expect(remainingMs({ kind: "track" }, 0)).toBeNull();
  });

  it("holds full volume, then fades linearly to silence", () => {
    expect(fadeGain(60_000)).toBe(1);
    expect(fadeGain(FADE_SECONDS * 1000)).toBe(1);
    expect(fadeGain((FADE_SECONDS * 1000) / 2)).toBeCloseTo(0.5);
    expect(fadeGain(0)).toBe(0);
    expect(fadeGain(-5)).toBe(0);
  });

  it("rounds the label up so an armed timer never reads 0:00", () => {
    expect(formatRemaining(754_000)).toBe("12:34");
    expect(formatRemaining(400)).toBe("0:01");
  });
});

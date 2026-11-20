import { describe, expect, it } from "vitest";
import { scrollBehavior } from "./motion";

describe("scrollBehavior", () => {
  it("jumps instead of animating when the user asked for reduced motion", () => {
    expect(scrollBehavior((query) => ({ matches: query === "(prefers-reduced-motion: reduce)" }))).toBe("auto");
  });

  it("keeps the smooth karaoke scroll otherwise, and when matchMedia is unavailable", () => {
    expect(scrollBehavior(() => ({ matches: false }))).toBe("smooth");
    expect(scrollBehavior(undefined)).toBe("smooth");
  });
});

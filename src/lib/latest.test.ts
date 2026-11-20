import { describe, expect, it } from "vitest";
import { createLatest } from "./latest";

describe("createLatest", () => {
  it("only the newest ticket is current", () => {
    const latest = createLatest();
    const first = latest.next();
    const second = latest.next();
    expect(latest.isCurrent(first)).toBe(false);
    expect(latest.isCurrent(second)).toBe(true);
  });

  it("invalidate drops a ticket that is still in flight", () => {
    const latest = createLatest();
    const ticket = latest.next();
    latest.invalidate();
    expect(latest.isCurrent(ticket)).toBe(false);
    expect(latest.isCurrent(latest.next())).toBe(true);
  });
});

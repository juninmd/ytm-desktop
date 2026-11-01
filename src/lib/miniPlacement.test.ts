import { describe, expect, it } from "vitest";
import { isReachable, readPosition } from "./miniPlacement";

const primary = { x: 0, y: 0, width: 1920, height: 1080 };
const left = { x: -1920, y: 0, width: 1920, height: 1080 };

describe("mini window placement", () => {
  it("accepts a position on a connected monitor, including one left of the primary", () => {
    expect(isReachable({ x: 400, y: 300 }, [primary])).toBe(true);
    expect(isReachable({ x: -1500, y: 200 }, [left, primary])).toBe(true);
  });

  it("rejects a position whose monitor was unplugged", () => {
    expect(isReachable({ x: -1500, y: 200 }, [primary])).toBe(false);
  });

  it("rejects a title bar pushed off any edge", () => {
    expect(isReachable({ x: 1900, y: 300 }, [primary])).toBe(false);
    expect(isReachable({ x: 400, y: 1070 }, [primary])).toBe(false);
    expect(isReachable({ x: 400, y: -30 }, [primary])).toBe(false);
    expect(isReachable({ x: 400, y: 300 }, [])).toBe(false);
  });

  it("rebuilds a stored position and rejects malformed ones", () => {
    expect(readPosition('{"x":10.4,"y":-20,"extra":1}')).toEqual({ x: 10, y: -20 });
    expect(readPosition(null)).toBeNull();
    expect(readPosition("not json")).toBeNull();
    expect(readPosition('{"x":"1","y":2}')).toBeNull();
    expect(readPosition('{"x":null,"y":2}')).toBeNull();
    expect(readPosition("null")).toBeNull();
  });
});

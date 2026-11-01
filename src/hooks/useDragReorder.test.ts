import { describe, expect, it } from "vitest";
import { indexAtY } from "./useDragReorder";

const rows = [
  { top: 0, bottom: 50 },
  { top: 50, bottom: 100 },
  { top: 100, bottom: 150 },
];

describe("drag reorder hit-testing", () => {
  it("finds the row under the pointer", () => {
    expect(indexAtY(rows, 10)).toBe(0);
    expect(indexAtY(rows, 50)).toBe(1);
    expect(indexAtY(rows, 149)).toBe(2);
  });

  it("clamps a pointer dragged above or below the list", () => {
    expect(indexAtY(rows, -300)).toBe(0);
    expect(indexAtY(rows, 900)).toBe(2);
  });

  it("copes with an empty list", () => {
    expect(indexAtY([], 10)).toBe(0);
  });
});

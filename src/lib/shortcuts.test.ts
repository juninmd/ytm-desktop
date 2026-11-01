import { describe, expect, it } from "vitest";
import { resolveShortcut, SHORTCUTS, targetOwnsKey, type KeyInput, type Target } from "./shortcuts";

const press = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});
const body: Target = { tag: "BODY" };

describe("keyboard shortcuts", () => {
  it("maps the transport keys", () => {
    expect(resolveShortcut(press(" "), body)).toBe("toggle");
    expect(resolveShortcut(press("n"), body)).toBe("next");
    expect(resolveShortcut(press("N"), body)).toBe("next");
    expect(resolveShortcut(press("]"), body)).toBe("speed-up");
    expect(resolveShortcut(press("?"), body)).toBe("help");
    expect(resolveShortcut(press("ArrowUp"), body)).toBe("volume-up");
  });

  it("uses Ctrl+arrows for track changes and Ctrl+K for search", () => {
    expect(resolveShortcut(press("ArrowRight", { ctrlKey: true }), body)).toBe("next");
    expect(resolveShortcut(press("ArrowLeft", { ctrlKey: true }), body)).toBe("previous");
    expect(resolveShortcut(press("k", { ctrlKey: true }), body)).toBe("search");
  });

  it("leaves browser and OS chords alone", () => {
    expect(resolveShortcut(press("r", { ctrlKey: true }), body)).toBeNull();
    expect(resolveShortcut(press("s", { metaKey: true }), body)).toBeNull();
    expect(resolveShortcut(press("n", { altKey: true }), body)).toBeNull();
    expect(resolveShortcut(press("x"), body)).toBeNull();
  });

  it("never takes keys from a text field", () => {
    for (const key of [" ", "n", "/", "ArrowLeft", "?"]) {
      expect(resolveShortcut(press(key), { tag: "INPUT", type: "search" })).toBeNull();
    }
    expect(resolveShortcut(press("l"), { tag: "DIV", editable: true })).toBeNull();
    expect(resolveShortcut(press("l"), { tag: "TEXTAREA" })).toBeNull();
  });

  it("keeps working after a click on a button, except for the keys that press it", () => {
    const button: Target = { tag: "BUTTON" };
    expect(resolveShortcut(press("m"), button)).toBe("mute");
    expect(resolveShortcut(press(" "), button)).toBeNull();
    expect(targetOwnsKey(button, "Enter")).toBe(true);
  });

  it("keeps working after dragging a slider, except for the arrows it owns", () => {
    const slider: Target = { tag: "INPUT", type: "range" };
    expect(resolveShortcut(press("n"), slider)).toBe("next");
    expect(resolveShortcut(press(" "), slider)).toBe("toggle");
    expect(resolveShortcut(press("ArrowRight"), slider)).toBeNull();
  });

  it("documents every command it can resolve, exactly once", () => {
    const commands = SHORTCUTS.map((entry) => entry.command);
    expect(new Set(commands).size).toBe(commands.length);

    const keys = [" ", "n", "p", "m", "l", "s", "r", "[", "]", "q", "y", "/", "?"];
    const reachable = new Set(
      [...keys, "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) =>
        resolveShortcut(press(key), body),
      ),
    );
    for (const command of commands) expect(reachable.has(command)).toBe(true);
  });
});

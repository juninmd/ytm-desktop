import type { MessageKey } from "./i18n";

export type Command =
  | "toggle"
  | "seek-back"
  | "seek-forward"
  | "next"
  | "previous"
  | "volume-up"
  | "volume-down"
  | "mute"
  | "like"
  | "shuffle"
  | "repeat"
  | "queue"
  | "lyrics"
  | "speed-down"
  | "speed-up"
  | "search"
  | "mini"
  | "cinema"
  | "help";

export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
};

export type Target = {
  tag: string;
  type?: string;
  editable?: boolean;
};

/** Single source of truth: the handler resolves from it and the help sheet lists it. */
export const SHORTCUTS: { command: Command; keys: string[]; label: MessageKey }[] = [
  { command: "toggle", keys: ["Space"], label: "keys.toggle" },
  { command: "seek-back", keys: ["←"], label: "keys.seekBack" },
  { command: "seek-forward", keys: ["→"], label: "keys.seekForward" },
  { command: "previous", keys: ["P", "Ctrl ←"], label: "keys.previous" },
  { command: "next", keys: ["N", "Ctrl →"], label: "keys.next" },
  { command: "volume-up", keys: ["↑"], label: "keys.volumeUp" },
  { command: "volume-down", keys: ["↓"], label: "keys.volumeDown" },
  { command: "mute", keys: ["M"], label: "keys.mute" },
  { command: "like", keys: ["L", "Alt Shift B"], label: "keys.like" },
  { command: "shuffle", keys: ["S"], label: "keys.shuffle" },
  { command: "repeat", keys: ["R"], label: "keys.repeat" },
  { command: "speed-down", keys: ["["], label: "keys.speedDown" },
  { command: "speed-up", keys: ["]"], label: "keys.speedUp" },
  { command: "queue", keys: ["Q", "Alt Shift Q"], label: "keys.queue" },
  { command: "lyrics", keys: ["Y"], label: "keys.lyrics" },
  { command: "search", keys: ["/", "Ctrl K", "Ctrl L"], label: "keys.search" },
  { command: "cinema", keys: ["C"], label: "keys.cinema" },
  { command: "mini", keys: ["Ctrl Shift M"], label: "keys.mini" },
  { command: "help", keys: ["?"], label: "keys.help" },
];

const PLAIN: Record<string, Command> = {
  " ": "toggle",
  ArrowLeft: "seek-back",
  ArrowRight: "seek-forward",
  ArrowUp: "volume-up",
  ArrowDown: "volume-down",
  n: "next",
  p: "previous",
  m: "mute",
  l: "like",
  s: "shuffle",
  r: "repeat",
  "[": "speed-down",
  "]": "speed-up",
  q: "queue",
  y: "lyrics",
  c: "cinema",
  "/": "search",
  "?": "help",
};

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

/**
 * Whether the focused element owns this key. Text fields own everything; a
 * focused button keeps Space/Enter (they activate it); a range input keeps the
 * arrows. Anywhere else the global shortcuts apply, so they keep working after
 * a click on a play button or a drag of the volume slider.
 */
export function targetOwnsKey(target: Target, key: string): boolean {
  if (target.editable || target.tag === "TEXTAREA" || target.tag === "SELECT") return true;
  if (target.tag === "INPUT") {
    if (TEXT_INPUTS.has(target.type ?? "text")) return true;
    if (target.type === "range") return key.startsWith("Arrow") || key === "Home" || key === "End";
    return key === " " || key === "Enter";
  }
  if (target.tag === "BUTTON" || target.tag === "A") return key === " " || key === "Enter";
  return false;
}

/** Maps a key press to a command, or `null` when it is not one of ours. */
export function resolveShortcut(input: KeyInput, target: Target): Command | null {
  if (targetOwnsKey(target, input.key)) return null;
  if (input.metaKey) return null;
  if (input.altKey) {
    // Alt+Shift chords for the two commands that otherwise need a bare letter.
    if (!input.ctrlKey && input.shiftKey) {
      const key = input.key.toLowerCase();
      if (key === "q") return "queue";
      if (key === "b") return "like";
    }
    return null;
  }

  if (input.ctrlKey) {
    if (input.shiftKey && input.key.toLowerCase() === "m") return "mini";
    if (input.key === "ArrowRight") return "next";
    if (input.key === "ArrowLeft") return "previous";
    if (input.key.toLowerCase() === "k" || input.key.toLowerCase() === "l") return "search";
    return null;
  }
  return PLAIN[input.key.length === 1 ? input.key.toLowerCase() : input.key] ?? null;
}

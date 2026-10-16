/** Domain model for the player. Kept free of React so it can be unit-tested in isolation. */

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  /** Duration in seconds. */
  duration: number;
  year: number;
  /** Pre-formatted play count, as YouTube Music shows it. */
  plays: string;
};

export type Album = {
  id: string;
  title: string;
  artist: string;
  year: number;
  kind: "album" | "single" | "ep";
  trackIds: string[];
};

export type Playlist = {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
};

export type RepeatMode = "off" | "all" | "one";

export type PlayerState = {
  /** The immutable "context" the user started playing from. */
  queue: Track[];
  /** Index into `trackId` order, not `queue`. Kept separate so shuffle is reversible. */
  order: number[];
  cursor: number;
  isPlaying: boolean;
  /** Playhead position in seconds. */
  position: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  liked: string[];
};

export type View =
  | { kind: "home" }
  | { kind: "library" }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string };

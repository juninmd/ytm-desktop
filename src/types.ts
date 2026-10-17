/** Domain model for the player. Kept free of React so it can be unit-tested in isolation. */

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  /** Duration in seconds. `0` means "unknown until the player reports it". */
  duration: number;
  year: number;
  /** Pre-formatted play count, as YouTube Music shows it. */
  plays: string;
  /** Cover url when the catalogue provides one; artwork falls back to a hash. */
  thumbnail?: string;
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

/** A unified shape for anything that can be opened and played as a whole. */
export type Collection = {
  id: string;
  kind: "album" | "playlist";
  format: "album" | "ep" | "single" | "playlist";
  title: string;
  subtitle: string;
  description?: string;
  year?: number;
  trackIds: string[];
  /** Cover url when the catalogue provides one. */
  thumbnail?: string;
};

/** A horizontally-scrolling row of collections on the home screen. */
export type Shelf = {
  title: string;
  subtitle?: string;
  ids: string[];
};

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
  /** Increments on every new play so a replay reloads the audio element. */
  playToken: number;
};

export type View =
  | { kind: "home" }
  | { kind: "library" }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string };

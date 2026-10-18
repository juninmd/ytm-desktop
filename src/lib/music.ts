import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { isDesktop } from "./auth";
import * as mock from "../data/catalog";
import type { Collection, Shelf, Track } from "../types";

/**
 * The music boundary.
 *
 * Inside Tauri every call is proxied to Rust (`src-tauri/src/innertube.rs` and
 * `stream.rs`), which talks to the real YouTube Music InnerTube API and resolves
 * real audio through yt-dlp. In a plain browser — the design preview — the same
 * functions are answered from the bundled mock catalogue so the UI can be
 * reviewed offline. The two are interchangeable by shape.
 */

export type CatalogPage = {
  collections: Collection[];
  tracks: Track[];
  /** Extra card rows (an artist's albums, "You might also like"). */
  sections?: Shelf[];
  /** Token for the next page, when the API exposes one. */
  continuation?: string;
  /** Page title (artist name, album name, …). */
  title?: string;
};
export type HomeData = { quickPicks: string[]; shelves: Shelf[]; collections: Collection[] };
export type LibraryData = { available: boolean; collections: Collection[]; tracks: Track[] };

export type StreamInfo = {
  url: string;
  ext: string;
  expiresIn: number;
  trackId: string;
  /** True when `url` is a local file path (downloaded), not a remote url. */
  local: boolean;
};
export type ResolverStatus = { available: boolean; binary: string | null; detail: string | null };

export async function fetchHome(): Promise<HomeData> {
  if (isDesktop()) return invoke<HomeData>("music_home");
  return {
    quickPicks: mock.quickPicks,
    shelves: mock.shelves,
    collections: mock.collections,
  };
}

export async function searchMusic(query: string, filter = "all"): Promise<CatalogPage> {
  if (isDesktop()) return invoke<CatalogPage>("music_search", { query, filter });

  // Browser preview: filter the mock catalogue the way the old view did.
  const term = normalize(query.trim());
  let collections = mock.collections.filter(
    (collection) =>
      normalize(collection.title).includes(term) ||
      normalize(collection.subtitle).includes(term),
  );
  let tracks = mock.tracks.filter(
    (track) =>
      normalize(track.title).includes(term) ||
      normalize(track.artist).includes(term) ||
      normalize(track.album).includes(term),
  );

  if (filter === "songs") collections = [];
  if (filter === "albums") tracks = [];
  if (filter === "albums") collections = collections.filter((item) => item.kind === "album");
  if (filter === "playlists") tracks = [];
  if (filter === "playlists") collections = collections.filter((item) => item.kind === "playlist");
  if (filter === "artists") return { collections: [], tracks: [] };

  return { collections, tracks, sections: [] };
}

/** Fetches the next page from a continuation token. */
export async function fetchMore(continuation: string, search = false): Promise<CatalogPage> {
  if (isDesktop()) return invoke<CatalogPage>("music_more", { continuation, search });
  return { collections: [], tracks: [], sections: [] };
}

/** The endless radio that follows a track. */
export async function fetchRadio(videoId: string): Promise<Track[]> {
  if (isDesktop()) return invoke<Track[]>("music_radio", { videoId });
  return mock.tracks.filter((track) => track.id !== videoId).slice(0, 5);
}

export async function browseCollection(id: string): Promise<CatalogPage> {
  if (isDesktop()) return invoke<CatalogPage>("music_browse", { id });

  const collection = mock.getCollection(id);
  if (!collection) return { collections: [], tracks: [], sections: [] };
  return {
    collections: [collection],
    tracks: mock.resolveTracks(collection.trackIds),
    sections: [],
  };
}

export async function fetchLibrary(): Promise<LibraryData> {
  if (isDesktop()) return invoke<LibraryData>("music_library");
  return { available: true, collections: mock.collections, tracks: mock.tracks };
}

/** Stores the browser cookie that unlocks the private library. */
export async function saveLibraryCookies(cookie: string): Promise<void> {
  if (isDesktop()) await invoke("auth_save_cookies", { cookies: cookie });
}

export async function clearLibraryCookies(): Promise<void> {
  if (isDesktop()) await invoke("auth_clear_cookies");
}

export type ImportOutcome = { browser: string; fields: string[] };

/** Lists the browsers the backend can read cookies from. */
export async function cookieBrowsers(): Promise<string[]> {
  if (isDesktop()) return invoke<string[]>("cookie_browsers");
  return [];
}

/**
 * Reads the YouTube Music cookie straight out of the browser's store (via
 * yt-dlp) instead of asking the user to paste the header.
 */
export async function importBrowserCookies(browser: string): Promise<ImportOutcome> {
  if (isDesktop()) return invoke<ImportOutcome>("auth_import_browser_cookies", { browser });
  throw new Error("Ler cookies do navegador só existe no app desktop (Tauri).");
}

export async function resolveStream(trackId: string): Promise<StreamInfo> {
  if (!isDesktop()) {
    throw new Error("O áudio real só existe no app desktop (Tauri).");
  }
  return invoke<StreamInfo>("music_stream", { trackId });
}

/** Warms the resolver cache for a track the player is likely to reach next. */
export async function prefetchStream(trackId: string): Promise<boolean> {
  if (!isDesktop()) return false;
  return invoke<boolean>("music_prefetch", { trackId });
}

/** The network stream, used when a downloaded file cannot be played. */
export async function resolveRemoteStream(trackId: string): Promise<StreamInfo> {
  if (!isDesktop()) {
    throw new Error("O áudio real só existe no app desktop (Tauri).");
  }
  return invoke<StreamInfo>("music_remote_stream", { trackId });
}

/** The webview url for a downloaded file (asset protocol). */
export function localStreamUrl(path: string): string {
  return convertFileSrc(path);
}

export type DownloadEntry = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  /** Absolute path on disk. */
  file: string;
  bytes: number;
  downloadedAt: number;
};

export type DownloadRequest = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
};

/** Downloads a track for offline playback (or returns the existing file). */
export async function downloadTrack(track: DownloadRequest): Promise<DownloadEntry | null> {
  if (!isDesktop()) return null;
  return invoke<DownloadEntry>("music_download", { track });
}

export async function fetchDownloads(): Promise<DownloadEntry[]> {
  if (isDesktop()) return invoke<DownloadEntry[]>("music_downloads");
  return [];
}

export async function deleteDownload(trackId: string): Promise<void> {
  if (isDesktop()) await invoke("music_delete_download", { trackId });
}

/** Tells the backend which `hl` to use for catalogue requests. */
export async function setDataLocale(locale: "pt" | "en"): Promise<void> {
  if (isDesktop()) await invoke("set_locale", { locale });
}

/** Whether the desktop backend can actually resolve real audio (yt-dlp). */
export async function resolverStatus(): Promise<ResolverStatus> {
  if (isDesktop()) return invoke<ResolverStatus>("music_resolver_status");
  return { available: false, binary: null, detail: "Pré-visualização no navegador." };
}

/**
 * Likes or un-likes a track on the account. Resolves `false` when no library is
 * connected (the like stays local); rejects when the account write failed.
 */
export async function rateTrack(trackId: string, rating: "like" | "none"): Promise<boolean> {
  if (!isDesktop()) return false;
  return invoke<boolean>("music_rate", { trackId, rating });
}

export type LyricLine = { time: number; text: string };
export type Lyrics = { synced: boolean; source: string; lines: LyricLine[] };
export type LyricsQuery = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
};

/** Timed lyrics when available, otherwise the official plain text. */
export async function fetchLyrics(query: LyricsQuery): Promise<Lyrics> {
  if (isDesktop()) return invoke<Lyrics>("music_lyrics", { query });
  return demoLyrics(query);
}

/** A small synchronised example so the panel is reviewable in the browser. */
function demoLyrics(track: LyricsQuery): Lyrics {
  const lines = [
    "Segure o microfone imaginário",
    "a letra acompanha a reprodução",
    "a linha atual fica em destaque",
    "e você pode clicar para pular",
    "isto é a pré-visualização",
    "do modo karaokê",
  ];
  const step = track.duration > 0 ? track.duration / (lines.length + 1) : 12;
  return {
    synced: true,
    source: "demonstração",
    lines: lines.map((text, index) => ({ time: step * (index + 1), text })),
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

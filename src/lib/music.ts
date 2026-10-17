import { invoke } from "@tauri-apps/api/core";
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

export type CatalogPage = { collections: Collection[]; tracks: Track[] };
export type HomeData = { quickPicks: string[]; shelves: Shelf[]; collections: Collection[] };
export type LibraryData = { available: boolean; collections: Collection[]; tracks: Track[] };

export type StreamInfo = { url: string; ext: string; expiresIn: number; trackId: string };
export type ResolverStatus = { available: boolean; binary: string | null; detail: string | null };

export async function fetchHome(): Promise<HomeData> {
  if (isDesktop()) return invoke<HomeData>("music_home");
  return {
    quickPicks: mock.quickPicks,
    shelves: mock.shelves,
    collections: mock.collections,
  };
}

export async function searchMusic(query: string): Promise<CatalogPage> {
  if (isDesktop()) return invoke<CatalogPage>("music_search", { query });

  // Browser preview: filter the mock catalogue the way the old view did.
  const term = normalize(query.trim());
  const collections = mock.collections.filter(
    (collection) =>
      normalize(collection.title).includes(term) ||
      normalize(collection.subtitle).includes(term),
  );
  const tracks = mock.tracks.filter(
    (track) =>
      normalize(track.title).includes(term) ||
      normalize(track.artist).includes(term) ||
      normalize(track.album).includes(term),
  );
  return { collections, tracks };
}

export async function browseCollection(id: string): Promise<CatalogPage> {
  if (isDesktop()) return invoke<CatalogPage>("music_browse", { id });

  const collection = mock.getCollection(id);
  if (!collection) return { collections: [], tracks: [] };
  return { collections: [collection], tracks: mock.resolveTracks(collection.trackIds) };
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

/** Whether the desktop backend can actually resolve real audio (yt-dlp). */
export async function resolverStatus(): Promise<ResolverStatus> {
  if (isDesktop()) return invoke<ResolverStatus>("music_resolver_status");
  return { available: false, binary: null, detail: "Pré-visualização no navegador." };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  browseCollection,
  clearLibraryCookies,
  cookieBrowsers,
  deleteDownload,
  downloadTrack as downloadTrackIpc,
  fetchDownloads,
  fetchHome,
  fetchLibrary,
  fetchMore,
  importBrowserCookies,
  saveLibraryCookies,
  searchMusic,
  type CatalogPage,
  type DownloadEntry,
  type DownloadRequest,
  type HomeData,
  type ImportOutcome,
  type LibraryData,
} from "../lib/music";
import { isDesktop } from "../lib/auth";
import { EMPTY_MAPS, mergeCatalog, type CatalogMaps } from "../lib/catalog";
import type { Collection, Shelf, Track } from "../types";

/**
 * The catalogue store.
 *
 * Everything the views render comes from here: the real YouTube Music
 * catalogue inside Tauri, the bundled mock one in the browser preview. Views
 * never touch the IPC layer directly — they read collections, resolve ids to
 * tracks and ask for a collection to be loaded when it is only a card so far.
 */

export type LoadedCollection = {
  collection: Collection;
  tracks: Track[];
  sections: Shelf[];
  continuation?: string;
};

export type SearchFilter = "all" | "songs" | "albums" | "artists" | "playlists";

export type CatalogApi = {
  /** `ytmusic` when backed by the real API, `demo` when backed by the mock. */
  source: "ytmusic" | "demo";
  status: "loading" | "ready" | "error";
  error: string | null;
  /** Home feed — empty until it loads. */
  quickPicks: string[];
  shelves: HomeData["shelves"];
  /** What the library/personal side should show. */
  libraryCollections: Collection[];
  /** False when no browser cookie is stored, so the UI can prompt for one. */
  libraryAvailable: boolean;
  /** The account's "Liked music" collection id, when one is known. */
  likedId: string | null;
  /** Track ids from the account's liked songs, to seed the local liked set. */
  likedTrackIds: string[];

  getCollection: (id: string) => Collection | undefined;
  resolveTracks: (ids: string[]) => Track[];

  /** Loads a card-only collection (home shelves) on demand. */
  ensureCollection: (id: string) => Promise<LoadedCollection | undefined>;
  /** Card rows attached to a page (an artist's albums, related rows). */
  getSections: (id: string) => Shelf[];
  /** Whether a collection has another page to fetch. */
  hasMore: (id: string) => boolean;
  /** Appends the next page of a collection. Resolves the number of new tracks. */
  loadMore: (id: string) => Promise<number>;
  search: (query: string, filter?: SearchFilter) => Promise<CatalogPage>;
  searchMore: (continuation: string) => Promise<CatalogPage>;

  refresh: () => Promise<void>;
  saveCookies: (cookie: string) => Promise<void>;
  clearCookies: () => Promise<void>;
  /** Browsers whose cookie store can be read, per the Rust backend. */
  browsers: string[];
  /** Reads the cookie from a browser and reloads the library. */
  importCookies: (browser: string) => Promise<ImportOutcome>;

  /** Tracks downloaded for offline playback. */
  downloads: DownloadEntry[];
  /** The downloaded tracks as playable tracks. */
  downloadTracks: Track[];
  isDownloaded: (id: string) => boolean;
  /** Downloads a track (or returns the existing file) and refreshes the list. */
  download: (track: DownloadRequest) => Promise<DownloadEntry | null>;
  /** Downloads many tracks, refreshing the list once. Resolves the failures. */
  downloadMany: (tracks: DownloadRequest[]) => Promise<number>;
  removeDownload: (id: string) => Promise<void>;
};

const CatalogContext = createContext<CatalogApi | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [maps, setMaps] = useState<CatalogMaps>(EMPTY_MAPS);
  const [home, setHome] = useState<HomeData | null>(null);
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [status, setStatus] = useState<CatalogApi["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [browsers, setBrowsers] = useState<string[]>([]);
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [sections, setSections] = useState<Record<string, Shelf[]>>({});
  const [continuations, setContinuations] = useState<Record<string, string>>({});

  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  const merge = useCallback((page: CatalogPage) => {
    setMaps((previous) => mergeCatalog(previous, page));
  }, []);

  const loadLibrary = useCallback(async () => {
    try {
      const data = await fetchLibrary();
      merge({ collections: data.collections, tracks: data.tracks });
      setLibrary(data);
    } catch {
      // The personal library is optional; search and home still work.
      setLibrary({ available: false, collections: [], tracks: [] });
    }
  }, [merge]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await fetchHome();
      merge({ collections: data.collections, tracks: [] });
      setHome(data);
      setStatus("ready");
      void loadLibrary();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, [merge, loadLibrary]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The browsers the backend can read cookies from, so the form offers only
  // real options.
  useEffect(() => {
    let cancelled = false;
    void cookieBrowsers()
      .then((list) => {
        if (!cancelled) setBrowsers(list);
      })
      .catch(() => {
        // No browser list (browser preview): the paste path still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureCollection = useCallback(
    async (id: string): Promise<LoadedCollection | undefined> => {
      const existing = mapsRef.current.collections[id];
      if (existing && existing.trackIds.length > 0) {
        return {
          collection: existing,
          tracks: existing.trackIds.flatMap((trackId) => {
            const track = mapsRef.current.tracks[trackId];
            return track ? [track] : [];
          }),
          sections: [],
        };
      }

      const page = await browseCollection(id);
      if (page.collections.length > 0 || page.tracks.length > 0) merge(page);

      const collection = page.collections[0] ?? existing;
      if (!collection) return undefined;

      if (page.sections && page.sections.length > 0) {
        setSections((previous) => ({ ...previous, [id]: page.sections ?? [] }));
      }
      if (page.continuation) {
        setContinuations((previous) => ({ ...previous, [id]: page.continuation as string }));
      }

      return {
        collection: { ...collection, id },
        tracks: page.tracks,
        sections: page.sections ?? [],
        continuation: page.continuation,
      };
    },
    [merge],
  );

  /** Appends the next page of a collection, extending its track list in place. */
  const loadMore = useCallback(
    async (id: string): Promise<number> => {
      const token = continuations[id];
      if (!token) return 0;

      const page = await fetchMore(token, false);
      merge(page);

      setContinuations((previous) => {
        const next = { ...previous };
        if (page.continuation) next[id] = page.continuation;
        else delete next[id];
        return next;
      });

      const added = page.tracks.map((track) => track.id);
      if (added.length > 0) {
        setMaps((previous) => {
          const collection = previous.collections[id];
          if (!collection) return previous;
          const known = new Set(collection.trackIds);
          const trackIds = [...collection.trackIds, ...added.filter((trackId) => !known.has(trackId))];
          return {
            ...previous,
            collections: { ...previous.collections, [id]: { ...collection, trackIds } },
          };
        });
      }

      return added.length;
    },
    [continuations, merge],
  );

  const search = useCallback(
    async (query: string, filter: SearchFilter = "all") => {
      const page = await searchMusic(query, filter);
      merge(page);
      return page;
    },
    [merge],
  );

  const searchMore = useCallback(async (continuation: string) => {
    const page = await fetchMore(continuation, true);
    merge(page);
    return page;
  }, [merge]);

  const saveCookies = useCallback(
    async (cookie: string) => {
      await saveLibraryCookies(cookie);
      await loadLibrary();
    },
    [loadLibrary],
  );

  const clearCookies = useCallback(async () => {
    await clearLibraryCookies();
    setLibrary({ available: false, collections: [], tracks: [] });
  }, []);

  const importCookies = useCallback(
    async (browser: string) => {
      const outcome = await importBrowserCookies(browser);
      await loadLibrary();
      return outcome;
    },
    [loadLibrary],
  );

  const loadDownloads = useCallback(async () => {
    try {
      setDownloads(await fetchDownloads());
    } catch {
      setDownloads([]);
    }
  }, []);

  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);

  const download = useCallback(
    async (track: DownloadRequest) => {
      const entry = await downloadTrackIpc(track);
      await loadDownloads();
      return entry;
    },
    [loadDownloads],
  );

  /** Downloads sequentially, reloading the list once at the end. */
  const downloadMany = useCallback(
    async (tracks: DownloadRequest[]) => {
      let failed = 0;
      for (const track of tracks) {
        try {
          await downloadTrackIpc(track);
        } catch {
          failed += 1;
        }
      }
      await loadDownloads();
      return failed;
    },
    [loadDownloads],
  );

  const removeDownload = useCallback(
    async (id: string) => {
      await deleteDownload(id);
      await loadDownloads();
    },
    [loadDownloads],
  );

  const api = useMemo<CatalogApi>(() => {
    const { collections, tracks } = maps;

    const libraryCollections =
      library && library.available
        ? library.collections
        : // Demo mode seeds the library from the mock catalogue via fetchLibrary,
          // so an unavailable real library means "empty", not "everything".
          [];

    const likedId =
      libraryCollections.find(
        (collection) =>
          collection.id === "curtidas" || collection.id === "LM" || /curtidas|liked/i.test(collection.title),
      )?.id ?? null;

    const likedTrackIds = likedId ? collections[likedId]?.trackIds ?? [] : [];

    return {
      source: isDesktop() ? "ytmusic" : "demo",
      status,
      error,
      quickPicks: home?.quickPicks ?? [],
      shelves: home?.shelves ?? [],
      libraryCollections,
      libraryAvailable: library?.available ?? false,
      likedId,
      likedTrackIds,
      getCollection: (id) => collections[id],
      resolveTracks: (ids) => ids.flatMap((id) => (tracks[id] ? [tracks[id]] : [])),
      ensureCollection,
      getSections: (id) => sections[id] ?? [],
      hasMore: (id) => Boolean(continuations[id]),
      loadMore,
      search,
      searchMore,
      refresh,
      saveCookies,
      clearCookies,
      browsers,
      importCookies,
      downloads,
      downloadTracks: downloads.map((entry) => ({
        id: entry.id,
        title: entry.title,
        artist: entry.artist,
        album: entry.album,
        albumId: "",
        duration: entry.duration,
        year: 0,
        plays: "",
      })),
      isDownloaded: (id) => downloads.some((entry) => entry.id === id),
      download,
      downloadMany,
      removeDownload,
    };
  }, [
    maps,
    home,
    library,
    status,
    error,
    browsers,
    sections,
    continuations,
    downloads,
    ensureCollection,
    loadMore,
    search,
    searchMore,
    refresh,
    saveCookies,
    clearCookies,
    importCookies,
    download,
    downloadMany,
    removeDownload,
  ]);

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return value;
}

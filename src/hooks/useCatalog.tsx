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
  fetchHome,
  fetchLibrary,
  importBrowserCookies,
  saveLibraryCookies,
  searchMusic,
  type CatalogPage,
  type HomeData,
  type ImportOutcome,
  type LibraryData,
} from "../lib/music";
import { isDesktop } from "../lib/auth";
import type { Collection, Track } from "../types";

/**
 * The catalogue store.
 *
 * Everything the views render comes from here: the real YouTube Music
 * catalogue inside Tauri, the bundled mock one in the browser preview. Views
 * never touch the IPC layer directly — they read collections, resolve ids to
 * tracks and ask for a collection to be loaded when it is only a card so far.
 */

export type LoadedCollection = { collection: Collection; tracks: Track[] };

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

  getCollection: (id: string) => Collection | undefined;
  resolveTracks: (ids: string[]) => Track[];

  /** Loads a card-only collection (home shelves) on demand. */
  ensureCollection: (id: string) => Promise<LoadedCollection | undefined>;
  search: (query: string) => Promise<CatalogPage>;

  refresh: () => Promise<void>;
  saveCookies: (cookie: string) => Promise<void>;
  clearCookies: () => Promise<void>;
  /** Browsers whose cookie store can be read, per the Rust backend. */
  browsers: string[];
  /** Reads the cookie from a browser and reloads the library. */
  importCookies: (browser: string) => Promise<ImportOutcome>;
};

const CatalogContext = createContext<CatalogApi | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [maps, setMaps] = useState<{
    collections: Record<string, Collection>;
    tracks: Record<string, Track>;
  }>({ collections: {}, tracks: {} });
  const [home, setHome] = useState<HomeData | null>(null);
  const [library, setLibrary] = useState<LibraryData | null>(null);
  const [status, setStatus] = useState<CatalogApi["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [browsers, setBrowsers] = useState<string[]>([]);

  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  const merge = useCallback((page: CatalogPage) => {
    setMaps((previous) => {
      const collections = { ...previous.collections };
      for (const collection of page.collections) {
        if (!collection.id) continue;
        const existing = collections[collection.id];
        // Keep whichever side knows the track list.
        collections[collection.id] =
          existing && existing.trackIds.length > 0 && collection.trackIds.length === 0
            ? existing
            : collection;
      }
      const tracks = { ...previous.tracks };
      for (const track of page.tracks) tracks[track.id] = track;
      return { collections, tracks };
    });
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
        };
      }

      const page = await browseCollection(id);
      if (page.collections.length > 0 || page.tracks.length > 0) merge(page);

      const collection = page.collections[0] ?? existing;
      if (!collection) return undefined;
      return { collection: { ...collection, id }, tracks: page.tracks };
    },
    [merge],
  );

  const search = useCallback(
    async (query: string) => {
      const page = await searchMusic(query);
      merge(page);
      return page;
    },
    [merge],
  );

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

    return {
      source: isDesktop() ? "ytmusic" : "demo",
      status,
      error,
      quickPicks: home?.quickPicks ?? [],
      shelves: home?.shelves ?? [],
      libraryCollections,
      libraryAvailable: library?.available ?? false,
      likedId,
      getCollection: (id) => collections[id],
      resolveTracks: (ids) => ids.flatMap((id) => (tracks[id] ? [tracks[id]] : [])),
      ensureCollection,
      search,
      refresh,
      saveCookies,
      clearCookies,
      browsers,
      importCookies,
    };
  }, [maps, home, library, status, error, browsers, ensureCollection, search, refresh, saveCookies, clearCookies, importCookies]);

  return <CatalogContext.Provider value={api}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogApi {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return value;
}

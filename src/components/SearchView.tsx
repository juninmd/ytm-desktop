import { useEffect, useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import { useCatalog, type SearchFilter } from "../hooks/useCatalog";
import { CollectionCard } from "./CollectionCard";
import { TrackTable } from "./TrackTable";
import { cn } from "../lib/cn";
import type { CatalogPage } from "../lib/music";
import type { Collection } from "../types";

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "songs", label: "Músicas" },
  { id: "albums", label: "Álbuns" },
  { id: "artists", label: "Artistas" },
  { id: "playlists", label: "Playlists" },
];

export function SearchView({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (collection: Collection) => void;
}) {
  const { search, searchMore } = useCatalog();
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<CatalogPage>({ collections: [], tracks: [] });
  const [continuation, setContinuation] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setResults({ collections: [], tracks: [] });
      setContinuation(null);
      setState("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    setState("loading");
    setError(null);
    // Debounce so a fast typist does not fire a request per keystroke. The
    // previous results stay on screen until the new ones arrive.
    const timer = window.setTimeout(() => {
      search(term, filter)
        .then((page) => {
          if (cancelled) return;
          setResults(page);
          setContinuation(page.continuation ?? null);
          setState("idle");
        })
        .catch((cause) => {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setState("error");
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, filter, search]);

  const empty = results.collections.length === 0 && results.tracks.length === 0;

  if (state === "loading" && empty) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center text-muted">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <SearchX className="size-8 text-subtle" />
        <p className="mt-4 text-lg font-semibold">A busca falhou</p>
        <p className="mt-1 max-w-[46ch] text-sm text-muted">{error}</p>
      </div>
    );
  }

  const artists = results.collections.filter((collection) => collection.kind === "artist");
  const collections = results.collections.filter((collection) => collection.kind !== "artist");

  async function loadMore() {
    if (!continuation) return;
    setState("loading");
    try {
      const page = await searchMore(continuation);
      setResults((previous) => ({
        collections: mergeById(previous.collections, page.collections),
        tracks: mergeById(previous.tracks, page.tracks),
        sections: previous.sections,
        continuation: page.continuation,
      }));
      setContinuation(page.continuation ?? null);
      setState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  }

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">Resultados para “{query}”</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === id
                ? "bg-fg text-canvas"
                : "bg-white/6 text-muted hover:bg-white/12 hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="grid place-items-center px-6 py-24 text-center">
          <SearchX className="size-8 text-subtle" />
          <p className="mt-4 text-lg font-semibold">Nenhum resultado para “{query}”</p>
          <p className="mt-1 max-w-[46ch] text-sm text-muted">
            Verifique a grafia ou tente outro termo.
          </p>
        </div>
      ) : (
        <>
          {artists.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold tracking-tight">Artistas</h2>
              <div className="no-scrollbar -mx-2 mt-3 flex gap-1 overflow-x-auto px-2 pb-1">
                {artists.map((artist) => (
                  <CollectionCard
                    key={artist.id}
                    collection={artist}
                    onOpen={onOpen}
                    className="w-[172px] shrink-0"
                  />
                ))}
              </div>
            </section>
          )}

          {collections.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold tracking-tight">Coleções</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {collections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}

          {results.tracks.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold tracking-tight">Faixas</h2>
              <div className="mt-3 rounded-lg bg-black/25 py-2">
                <TrackTable tracks={results.tracks} showAlbum={false} />
              </div>
            </section>
          )}

          {continuation && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={state === "loading"}
                className="flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
              >
                {state === "loading" && <Loader2 className="size-4 animate-spin" />}
                Carregar mais
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Appends pages without duplicating entries by id. */
function mergeById<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const seen = new Set(previous.map((item) => item.id));
  return [...previous, ...next.filter((item) => !seen.has(item.id))];
}

import { useEffect, useRef, useState } from "react";
import { SearchX } from "lucide-react";
import { Button, EmptyState, Spinner } from "@juninmd/sonido";
import { useCatalog, type SearchFilter } from "../hooks/useCatalog";
import { CollectionCard } from "./CollectionCard";
import { TrackTable } from "./TrackTable";
import { cn } from "../lib/cn";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { CatalogPage } from "../lib/music";
import type { Collection } from "../types";

const FILTERS: { id: SearchFilter; label: MessageKey }[] = [
  { id: "all", label: "search.filterAll" },
  { id: "songs", label: "search.filterSongs" },
  { id: "albums", label: "search.filterAlbums" },
  { id: "artists", label: "search.filterArtists" },
  { id: "playlists", label: "search.filterPlaylists" },
];

export function SearchView({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (collection: Collection) => void;
}) {
  const { search, searchMore } = useCatalog();
  const { t } = useI18n();
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<CatalogPage>({ collections: [], tracks: [] });
  const [continuation, setContinuation] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  // Bumped by "try again" so the search effect re-runs for the same query and filter.
  const [attempt, setAttempt] = useState(0);
  // Bumped on every new search so a "load more" still in flight cannot append
  // the previous query's page to the new results.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setMoreError(null);
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
  }, [query, filter, search, attempt]);

  const empty = results.collections.length === 0 && results.tracks.length === 0;

  if (state === "loading" && empty) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center text-muted">
        <Spinner size={24} label={t("search.loading")} />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div role="alert" className="px-6 py-12">
        <EmptyState
          icon={<SearchX className="size-7" />}
          title={t("search.failed")}
          description={error}
          action={
            <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  const artists = results.collections.filter((collection) => collection.kind === "artist");
  const collections = results.collections.filter((collection) => collection.kind !== "artist");

  async function loadMore() {
    if (!continuation) return;
    const started = generation.current;
    setState("loading");
    setMoreError(null);
    try {
      const page = await searchMore(continuation);
      if (started !== generation.current) return;
      setResults((previous) => ({
        collections: mergeById(previous.collections, page.collections),
        tracks: mergeById(previous.tracks, page.tracks),
        sections: previous.sections,
        continuation: page.continuation,
      }));
      setContinuation(page.continuation ?? null);
      setState("idle");
    } catch (cause) {
      if (started !== generation.current) return;
      // Keep the results already on screen; only the extra page failed.
      setMoreError(cause instanceof Error ? cause.message : String(cause));
      setState("idle");
    }
  }

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">
        {t("search.title", { query })}
      </h1>

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
            {t(label)}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="px-6 py-12">
          <EmptyState
            icon={<SearchX className="size-7" />}
            title={t("search.empty", { query })}
            description={t("search.emptyHint")}
          />
        </div>
      ) : (
        <>
          {artists.length > 0 && (
            <section className="mt-6">
              <h2 className="text-lg font-bold tracking-tight">{t("search.artists")}</h2>
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
              <h2 className="text-lg font-bold tracking-tight">{t("search.collections")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {collections.map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}

          {results.tracks.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-bold tracking-tight">{t("search.tracks")}</h2>
              <div className="mt-3 rounded-lg bg-black/25 py-2">
                <TrackTable tracks={results.tracks} showAlbum={false} />
              </div>
            </section>
          )}

          {moreError && (
            <p role="alert" className="mt-6 text-center text-sm text-muted">
              {t("search.failed")}: {moreError}
            </p>
          )}

          {continuation && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                loading={state === "loading"}
                onClick={() => void loadMore()}
              >
                {t("search.loadMore")}
              </Button>
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

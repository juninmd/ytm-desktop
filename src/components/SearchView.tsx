import { useEffect, useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { CollectionCard } from "./CollectionCard";
import { TrackTable } from "./TrackTable";
import type { CatalogPage } from "../lib/music";
import type { Collection } from "../types";

export function SearchView({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (collection: Collection) => void;
}) {
  const { search } = useCatalog();
  const [results, setResults] = useState<CatalogPage>({ collections: [], tracks: [] });
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setResults({ collections: [], tracks: [] });
      setState("idle");
      return;
    }

    let cancelled = false;
    setState("loading");
    // Debounce so a fast typist does not fire a request per keystroke.
    const timer = window.setTimeout(() => {
      search(term)
        .then((page) => {
          if (cancelled) return;
          setResults(page);
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
  }, [query, search]);

  if (state === "loading") {
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

  if (results.collections.length === 0 && results.tracks.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <SearchX className="size-8 text-subtle" />
        <p className="mt-4 text-lg font-semibold">Nenhum resultado para “{query}”</p>
        <p className="mt-1 max-w-[46ch] text-sm text-muted">
          Verifique a grafia ou tente outro termo.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">Resultados para “{query}”</h1>

      {results.collections.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight">Coleções</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {results.collections.map((collection) => (
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
    </div>
  );
}

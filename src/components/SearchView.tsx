import { SearchX } from "lucide-react";
import { collections, tracks } from "../data/catalog";
import { CollectionCard } from "./CollectionCard";
import { TrackTable } from "./TrackTable";
import type { Collection } from "../data/catalog";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SearchView({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (collection: Collection) => void;
}) {
  const term = normalize(query.trim());

  const matchedCollections = collections.filter(
    (collection) =>
      normalize(collection.title).includes(term) || normalize(collection.subtitle).includes(term),
  );
  const matchedTracks = tracks.filter(
    (track) =>
      normalize(track.title).includes(term) ||
      normalize(track.artist).includes(term) ||
      normalize(track.album).includes(term),
  );

  if (matchedCollections.length === 0 && matchedTracks.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <SearchX className="size-8 text-subtle" />
        <p className="mt-4 text-lg font-semibold">Nenhum resultado para “{query}”</p>
        <p className="mt-1 max-w-[46ch] text-sm text-muted">
          Verifique a grafia ou tente outro termo. Neste protótipo a busca percorre um catálogo
          fictício embarcado.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">
        Resultados para “{query}”
      </h1>

      {matchedCollections.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold tracking-tight">Coleções</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {matchedCollections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {matchedTracks.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">Faixas</h2>
          <div className="mt-3 rounded-lg bg-black/25 py-2">
            <TrackTable trackIds={matchedTracks.map((track) => track.id)} />
          </div>
        </section>
      )}
    </div>
  );
}

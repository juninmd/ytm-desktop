import { useState } from "react";
import { albums, collections, playlists } from "../data/catalog";
import { CollectionCard } from "./CollectionCard";
import { cn } from "../lib/cn";
import type { Collection } from "../data/catalog";

type Filter = "all" | "playlists" | "albums";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "playlists", label: "Playlists" },
  { id: "albums", label: "Álbuns" },
];

export function LibraryView({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = collections.filter((collection) => {
    if (filter === "all") return true;
    return filter === "playlists" ? collection.kind === "playlist" : collection.kind === "album";
  });

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">Sua biblioteca</h1>
      <p className="mt-1 text-sm text-muted">
        {playlists.length} playlists · {albums.length} álbuns e singles
      </p>

      <div className="mt-5 flex gap-2">
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

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {visible.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

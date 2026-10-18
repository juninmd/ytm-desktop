import { useState } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { CollectionCard } from "./CollectionCard";
import { LibraryCookieForm } from "./LibraryCookieForm";
import { cn } from "../lib/cn";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { Collection } from "../types";

type Filter = "all" | "playlists" | "albums";

const FILTERS: { id: Filter; label: MessageKey }[] = [
  { id: "all", label: "library.filterAll" },
  { id: "playlists", label: "library.filterPlaylists" },
  { id: "albums", label: "library.filterAlbums" },
];

export function LibraryView({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { libraryCollections, libraryAvailable, source } = useCatalog();
  const { t } = useI18n();

  const visible = libraryCollections.filter((collection) => {
    if (filter === "all") return true;
    return filter === "playlists" ? collection.kind === "playlist" : collection.kind === "album";
  });

  if (source === "ytmusic" && !libraryAvailable) {
    return (
      <div className="px-6 pb-10">
        <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("library.title")}</h1>
        <LibraryCookieForm />
      </div>
    );
  }

  const playlists = libraryCollections.filter((collection) => collection.kind === "playlist");
  const albums = libraryCollections.filter((collection) => collection.kind === "album");

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("library.title")}</h1>
      <p className="mt-1 text-sm text-muted">
        {t("library.count", { playlists: playlists.length, albums: albums.length })}
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
            {t(label)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted">{t("library.empty")}</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {visible.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

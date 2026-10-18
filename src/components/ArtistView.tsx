import { useEffect, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { usePlayCollection } from "../hooks/usePlayCollection";
import { heroStyle } from "../lib/cover";
import { Cover } from "./Cover";
import { CollectionCard } from "./CollectionCard";
import { TrackTable } from "./TrackTable";
import { useI18n } from "../lib/i18n";
import type { Collection } from "../types";

/**
 * An artist page: the name and artwork, the top songs, then the rows the
 * catalogue attaches to the artist (albums, singles, playlists).
 */
export function ArtistView({
  id,
  onOpen,
}: {
  id: string;
  onOpen: (collection: Collection) => void;
}) {
  const { getCollection, getSections, ensureCollection, resolveTracks } = useCatalog();
  const playCollection = usePlayCollection();
  const { t } = useI18n();
  const [loading, setLoading] = useState(!getCollection(id));
  const [failed, setFailed] = useState(false);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (attempted.current === id) return;
    attempted.current = id;
    setLoading(true);
    setFailed(false);
    ensureCollection(id)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [id, ensureCollection]);

  const artist = getCollection(id);
  const sections = getSections(id);
  const tracks = artist ? resolveTracks(artist.trackIds) : [];

  if (!artist) {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        {loading ? (
          <Loader2 className="size-6 animate-spin text-muted" />
        ) : failed ? (
          <p className="text-sm text-muted">{t("collection.loadingFailed")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pb-8">
      <div className="relative">
        <div
          className="fade-bottom pointer-events-none absolute inset-0"
          style={heroStyle(artist.id)}
        />
        <div className="relative flex items-end gap-6 px-6 pt-6 pb-6">
          <Cover
            seed={artist.id}
            title={artist.title}
            src={artist.thumbnail}
            round
            className="size-[168px] shadow-[0_24px_60px_rgb(0_0_0/0.55)]"
          />
          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold tracking-wide text-fg/80 uppercase">{t("format.artist")}</p>
            <h1 className="mt-2 text-5xl leading-[1.05] font-black tracking-tight break-words">
              {artist.title}
            </h1>
            {tracks.length > 0 && (
              <p className="mt-3 text-sm text-fg/85">
                {t("artist.topTracks", { count: tracks.length })}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 px-6 py-4">
        <button
          type="button"
          onClick={() => void playCollection(artist)}
          aria-label={t("collection.play", { title: artist.title })}
          className="bg-accent hover:bg-accent-strong grid size-14 place-items-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_90/0.35)] transition hover:scale-[1.04] active:scale-100"
        >
          <Play className="size-6 translate-x-px fill-current" />
        </button>
      </div>

      <div className="mx-6 rounded-lg bg-black/25 py-2">
        <TrackTable tracks={tracks} showAlbum={false} emptyLabel={t("artist.empty")} />
      </div>

      {sections.map((section) => (
        <section key={section.title} className="mt-10 px-6">
          <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
          <div className="no-scrollbar -mx-2 mt-3 flex gap-1 overflow-x-auto px-2 pb-1">
            {section.ids.map((collectionId) => {
              const collection = getCollection(collectionId);
              if (!collection) return null;
              return (
                <CollectionCard
                  key={`${section.title}-${collectionId}`}
                  collection={collection}
                  onOpen={onOpen}
                  className="w-[172px] shrink-0"
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Clock3, Download, Heart, Loader2, MoreHorizontal, Play, Shuffle } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { Cover } from "./Cover";
import { TrackTable } from "./TrackTable";
import { IconButton } from "./ui/IconButton";
import { usePlayCollection } from "../hooks/usePlayCollection";
import { usePlayer } from "../hooks/usePlayer";
import { heroStyle } from "../lib/cover";
import { cn } from "../lib/cn";
import { formatRuntime, pluralize } from "../lib/format";
import type { Collection } from "../types";

const FORMAT_LABEL: Record<Collection["format"], string> = {
  album: "Álbum",
  ep: "EP",
  single: "Single",
  playlist: "Playlist",
};

export function CollectionView({ collection: initial }: { collection: Collection }) {
  const playCollection = usePlayCollection();
  const { resolveTracks, ensureCollection, getCollection } = useCatalog();
  const { state, toggleShuffle, isLiked, toggleLike } = usePlayer();
  const [loading, setLoading] = useState(false);
  /** Guards against re-fetching as the store's callbacks change identity. */
  const attempted = useRef<string | null>(null);

  // Home shelves only hand over a card; the track list is loaded on open.
  const stored = getCollection(initial.id);
  const collection = stored ?? initial;
  const tracks = resolveTracks(collection.trackIds);
  const needsLoading = !stored || stored.trackIds.length === 0;

  useEffect(() => {
    if (!needsLoading || attempted.current === initial.id) return;
    attempted.current = initial.id;
    let cancelled = false;
    setLoading(true);
    ensureCollection(initial.id).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [initial.id, needsLoading, ensureCollection]);

  if (!stored) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  const lead = tracks[0];
  const leadLiked = lead ? isLiked(lead.id) : false;

  return (
    <div className="pb-8">
      <div className="relative">
        <div
          className="fade-bottom pointer-events-none absolute inset-0"
          style={heroStyle(collection.id)}
        />
        <div className="relative flex items-end gap-6 px-6 pt-6 pb-6">
          <Cover
            seed={collection.id}
            title={collection.title}
            src={collection.thumbnail}
            className="size-[188px] rounded-lg shadow-[0_24px_60px_rgb(0_0_0/0.55)]"
          />
          <div className="min-w-0 pb-1">
            <p className="text-xs font-semibold tracking-wide text-fg/80 uppercase">
              {FORMAT_LABEL[collection.format]}
            </p>
            <h1 className="mt-2 text-5xl leading-[1.05] font-black tracking-tight break-words">
              {collection.title}
            </h1>
            {collection.description && (
              <p className="mt-3 max-w-[62ch] text-sm text-fg/70">{collection.description}</p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg/85">
              <span className="font-semibold">{collection.subtitle}</span>
              {collection.year && <Dot />}
              {collection.year && <span>{collection.year}</span>}
              <Dot />
              <span>{pluralize(tracks.length, "faixa")}</span>
              {tracks.length > 0 && (
                <>
                  <Dot />
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {formatRuntime(tracks)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 px-6 py-4">
        <button
          type="button"
          onClick={() => void playCollection(collection)}
          aria-label={`Tocar ${collection.title}`}
          className="bg-accent hover:bg-accent-strong grid size-14 place-items-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_90/0.35)] transition hover:scale-[1.04] active:scale-100"
        >
          <Play className="size-6 translate-x-px fill-current" />
        </button>
        <IconButton label="Embaralhar" active={state.shuffle} onClick={toggleShuffle} className="size-9">
          <Shuffle className="size-6" />
        </IconButton>
        <IconButton
          label={leadLiked ? "Remover das curtidas" : "Curtir coleção"}
          onClick={() => lead && toggleLike(lead.id)}
          disabled={!lead}
          className={cn("size-9", leadLiked && "text-accent")}
        >
          <Heart className={cn("size-6", leadLiked && "fill-accent")} />
        </IconButton>
        <IconButton label="Baixar" className="size-9">
          <Download className="size-6" />
        </IconButton>
        <IconButton label="Mais opções" className="size-9">
          <MoreHorizontal className="size-6" />
        </IconButton>
      </div>

      <div className="mx-6 rounded-lg bg-black/25 py-2">
        {loading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : (
          <TrackTable
            tracks={tracks}
            showAlbum={collection.kind !== "album"}
            emptyLabel="Esta coleção ainda não tem faixas."
          />
        )}
      </div>
    </div>
  );
}

function Dot() {
  return <span className="text-fg/40">·</span>;
}

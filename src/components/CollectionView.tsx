import { useEffect, useRef, useState } from "react";
import { Clock3, Download, Heart, Loader2, Play, Shuffle } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { Cover } from "./Cover";
import { TrackTable } from "./TrackTable";
import { CollectionCard } from "./CollectionCard";
import { IconButton } from "./ui/IconButton";
import { usePlayCollection } from "../hooks/usePlayCollection";
import { usePlayer } from "../hooks/usePlayer";
import { heroStyle } from "../lib/cover";
import { cn } from "../lib/cn";
import { formatRuntime } from "../lib/format";
import { useI18n, type MessageKey } from "../lib/i18n";
import type { Collection } from "../types";

const FORMAT_LABEL: Record<Collection["format"], MessageKey> = {
  album: "format.album",
  ep: "format.ep",
  single: "format.single",
  playlist: "format.playlist",
  artist: "format.artist",
};

export function CollectionView({
  collection: initial,
  onOpen,
}: {
  collection: Collection;
  onOpen: (collection: Collection) => void;
}) {
  const playCollection = usePlayCollection();
  const {
    resolveTracks,
    ensureCollection,
    getCollection,
    getSections,
    hasMore,
    loadMore,
    downloadMany,
  } = useCatalog();
  const { state, toggleShuffle, isLiked, toggleLike, notify } = usePlayer();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
    setFailed(false);
    ensureCollection(initial.id)
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial.id, needsLoading, ensureCollection, attempt]);

  const retry = () => {
    attempted.current = null;
    setAttempt((value) => value + 1);
  };

  if (!stored) {
    if (loading) {
      return (
        <div className="grid place-items-center py-24">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      );
    }
    if (!failed) return null;
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <p className="text-lg font-semibold">{t("collection.loadingFailed")}</p>
        <p className="mt-1 text-sm text-muted">{t("collection.loadingFailedHint")}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 rounded-full border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          {t("common.retry")}
        </button>
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
              {t(FORMAT_LABEL[collection.format])}
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
              <span>{t("common.tracks", { count: tracks.length })}</span>
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
          aria-label={t("collection.play", { title: collection.title })}
          className="bg-accent hover:bg-accent-strong grid size-14 place-items-center rounded-full text-white shadow-[0_10px_30px_rgb(255_61_90/0.35)] transition hover:scale-[1.04] active:scale-100"
        >
          <Play className="size-6 translate-x-px fill-current" />
        </button>
        <IconButton label={t("collection.shuffle")} active={state.shuffle} onClick={toggleShuffle} className="size-9">
          <Shuffle className="size-6" />
        </IconButton>
        <IconButton
          label={leadLiked ? t("collection.unlike") : t("collection.like")}
          onClick={() => lead && toggleLike(lead.id)}
          disabled={!lead}
          className={cn("size-9", leadLiked && "text-accent")}
        >
          <Heart className={cn("size-6", leadLiked && "fill-accent")} />
        </IconButton>
        <IconButton
          label={saving ? t("collection.downloading") : t("collection.download")}
          className="size-9"
          disabled={saving || tracks.length === 0}
          onClick={() => {
            setSaving(true);
            void downloadMany(
              tracks.map((track) => ({
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
              })),
            )
              .then((failed) => {
                if (failed > 0) notify(t("collection.downloadFailed", { count: failed }));
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? <Loader2 className="size-6 animate-spin" /> : <Download className="size-6" />}
        </IconButton>
      </div>

      <div className="mx-6 rounded-lg bg-black/25 py-2">
        {loading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        ) : failed && tracks.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {t("collection.tracksFailed")}{" "}
            <button type="button" onClick={retry} className="underline hover:text-fg">
              {t("common.retry")}
            </button>
          </p>
        ) : (
          <TrackTable
            tracks={tracks}
            showAlbum={collection.kind !== "album"}
            emptyLabel={t("collection.empty")}
          />
        )}
      </div>

      {hasMore(collection.id) && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setLoadingMore(true);
              void loadMore(collection.id)
                .catch(() => setFailed(true))
                .finally(() => setLoadingMore(false));
            }}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            {t("search.loadMore")}
          </button>
        </div>
      )}

      {getSections(collection.id).map((section) => (
        <section key={section.title} className="mt-10 px-6">
          <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
          <div className="no-scrollbar -mx-2 mt-3 flex gap-1 overflow-x-auto px-2 pb-1">
            {section.ids.map((id) => {
              const card = getCollection(id);
              if (!card) return null;
              return (
                <CollectionCard
                  key={`${section.title}-${id}`}
                  collection={card}
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

function Dot() {
  return <span className="text-fg/40">·</span>;
}

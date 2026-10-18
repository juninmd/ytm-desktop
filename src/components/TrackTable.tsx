import { useState } from "react";
import { Check, Clock, Download, Heart, Loader2, Play } from "lucide-react";
import { Cover } from "./Cover";
import { Eq } from "./ui/Eq";
import { IconButton } from "./ui/IconButton";
import { usePlayer } from "../hooks/usePlayer";
import { useCatalog } from "../hooks/useCatalog";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import type { Track } from "../types";

const ROW = {
  "with-album":
    "grid grid-cols-[24px_minmax(0,1fr)_104px] items-center gap-4 xl:grid-cols-[24px_minmax(0,4fr)_minmax(0,3fr)_88px_104px]",
  "no-album":
    "grid grid-cols-[24px_minmax(0,1fr)_104px] items-center gap-4 xl:grid-cols-[24px_minmax(0,4fr)_88px_104px]",
} as const;

type Props = {
  tracks: Track[];
  showPosition?: boolean;
  /** Hidden when every row belongs to the same release. */
  showAlbum?: boolean;
  /** Rendered under the table when the collection is empty. */
  emptyLabel?: string;
};

export function TrackTable({
  tracks,
  showPosition = true,
  showAlbum = true,
  emptyLabel = "Nada por aqui ainda.",
}: Props) {
  const { play, current, isLiked, toggleLike, state, notify } = usePlayer();
  const { download, isDownloaded } = useCatalog();
  const [busy, setBusy] = useState<string[]>([]);
  const row = showAlbum ? ROW["with-album"] : ROW["no-album"];

  const save = (track: Track) => {
    if (busy.includes(track.id)) return; // a double click must not spawn twice
    setBusy((current) => [...current, track.id]);
    void download({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
    })
      .catch(() => notify(`Não foi possível baixar ${track.title}.`))
      .finally(() => setBusy((current) => current.filter((id) => id !== track.id)));
  };

  if (tracks.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div role="table" aria-label="Faixas">
      <div role="row" className={cn(row, "border-b border-line px-4 pb-2 text-xs text-subtle")}>
        <span role="columnheader" className="text-right">
          #
        </span>
        <span role="columnheader">Título</span>
        {showAlbum && (
          <span role="columnheader" className="hidden xl:block">
            Álbum
          </span>
        )}
        <span role="columnheader" className="hidden xl:block">
          Reproduções
        </span>
        <span role="columnheader" className="flex justify-end">
          <Clock className="size-4" aria-label="Duração" />
        </span>
      </div>

      <div role="rowgroup" className="pt-2">
        {tracks.map((track, index) => {
          const playing = current?.id === track.id;
          const liked = isLiked(track.id);
          const saved = isDownloaded(track.id);
          return (
            <div
              key={track.id}
              role="row"
              onDoubleClick={() => play(tracks, index)}
              className={cn(
                "group rounded-md px-4 py-2 transition-colors hover:bg-white/6",
                playing && "bg-white/6",
                row,
              )}
            >
              <span role="cell" className="flex justify-end">
                <button
                  type="button"
                  onClick={() => play(tracks, index)}
                  aria-label={`Tocar ${track.title}`}
                  className="grid size-5 place-items-center text-sm text-subtle tabular-nums"
                >
                  {playing && state.isPlaying ? (
                    <Eq />
                  ) : (
                    <>
                      <span className="group-hover:hidden">{showPosition ? index + 1 : ""}</span>
                      <Play className="hidden size-4 fill-fg text-fg group-hover:block" />
                    </>
                  )}
                </button>
              </span>

              <span role="cell" className="flex min-w-0 items-center gap-3">
                <Cover
                  seed={track.albumId || track.album}
                  title={track.album}
                  src={track.thumbnail}
                  className="size-10"
                />
                <button
                  type="button"
                  onClick={() => play(tracks, index)}
                  className="min-w-0 text-left text-sm"
                >
                  <span className={cn("block truncate font-medium", playing && "text-accent")}>
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-muted">{track.artist}</span>
                </button>
              </span>

              {showAlbum && (
                <span role="cell" className="hidden truncate text-xs text-muted xl:block">
                  {track.album}
                </span>
              )}

              <span role="cell" className="hidden text-xs text-muted tabular-nums xl:block">
                {track.plays}
              </span>

              <span role="cell" className="flex items-center justify-end gap-1">
                <IconButton
                  label={saved ? `${track.title} já está baixada` : `Baixar ${track.title}`}
                  onClick={() => save(track)}
                  disabled={saved || busy.includes(track.id)}
                  className={cn("opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100", saved && "opacity-100")}
                >
                  {busy.includes(track.id) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : saved ? (
                    <Check className="size-4 text-accent" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </IconButton>
                <IconButton
                  label={liked ? `Remover ${track.title} das curtidas` : `Curtir ${track.title}`}
                  onClick={() => toggleLike(track.id)}
                  className={cn(
                    "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                    liked && "opacity-100",
                  )}
                >
                  <Heart className={cn("size-4", liked && "fill-accent text-accent")} />
                </IconButton>
                <span className="w-10 text-right text-xs text-muted tabular-nums">
                  {track.duration > 0 ? formatTime(track.duration) : "--:--"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

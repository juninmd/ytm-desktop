import { Clock, Heart, Play } from "lucide-react";
import { resolveTracks } from "../data/catalog";
import { Cover } from "./Cover";
import { Eq } from "./ui/Eq";
import { IconButton } from "./ui/IconButton";
import { usePlayer } from "../hooks/usePlayer";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";

const ROW = {
  "with-album":
    "grid grid-cols-[24px_minmax(0,1fr)_104px] items-center gap-4 xl:grid-cols-[24px_minmax(0,4fr)_minmax(0,3fr)_88px_104px]",
  "no-album":
    "grid grid-cols-[24px_minmax(0,1fr)_104px] items-center gap-4 xl:grid-cols-[24px_minmax(0,4fr)_88px_104px]",
} as const;

type Props = {
  trackIds: string[];
  showPosition?: boolean;
  /** Hidden when every row belongs to the same release. */
  showAlbum?: boolean;
  /** Rendered under the table when the collection is empty. */
  emptyLabel?: string;
};

export function TrackTable({
  trackIds,
  showPosition = true,
  showAlbum = true,
  emptyLabel = "Nada por aqui ainda.",
}: Props) {
  const { play, current, isLiked, toggleLike, state } = usePlayer();
  const tracks = resolveTracks(trackIds);
  const row = showAlbum ? ROW["with-album"] : ROW["no-album"];

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
                <Cover seed={track.albumId} title={track.album} className="size-10" />
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
                  {formatTime(track.duration)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

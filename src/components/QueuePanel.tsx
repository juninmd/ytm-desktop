import { Heart, Play, X } from "lucide-react";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { usePlayer } from "../hooks/usePlayer";
import { cn } from "../lib/cn";
import type { Track } from "../types";

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { state, current, upNext, isLiked, toggleLike, play } = usePlayer();

  const jumpTo = (track: Track) => {
    const index = state.queue.findIndex((item) => item.id === track.id);
    if (index >= 0) play(state.queue, index);
  };

  return (
    <aside className="rounded-panel flex w-[340px] shrink-0 flex-col bg-panel">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Fila de reprodução</h2>
        <IconButton label="Fechar fila" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 py-2 text-xs font-semibold tracking-wide text-subtle uppercase">
          Tocando agora
        </p>
        {current ? (
          <QueueRow track={current} playing liked={isLiked(current.id)} onLike={toggleLike} onJump={jumpTo} />
        ) : (
          <p className="px-2 py-2 text-sm text-muted">A fila está vazia.</p>
        )}

        <p className="px-2 pt-5 pb-2 text-xs font-semibold tracking-wide text-subtle uppercase">
          A seguir {upNext.length > 0 && `· ${upNext.length}`}
        </p>
        {upNext.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted">
            Nada na sequência. Ative o modo aleatório ou escolha outra coleção.
          </p>
        ) : (
          upNext.map((track, index) => (
            <QueueRow
              key={`${track.id}-${index}`}
              track={track}
              liked={isLiked(track.id)}
              onLike={toggleLike}
              onJump={jumpTo}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function QueueRow({
  track,
  playing = false,
  liked,
  onLike,
  onJump,
}: {
  track: Track;
  playing?: boolean;
  liked: boolean;
  onLike: (id: string) => void;
  onJump: (track: Track) => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-hover",
        playing && "bg-white/6",
      )}
    >
      <button
        type="button"
        onClick={() => onJump(track)}
        aria-label={`Tocar ${track.title}`}
        className="relative shrink-0"
      >
        <Cover
          seed={track.albumId || track.album}
          title={track.album}
          src={track.thumbnail}
          className="size-10"
        />
        <span className="absolute inset-0 grid place-items-center rounded-md bg-black/60 opacity-0 transition group-hover:opacity-100">
          <Play className="size-4 fill-white text-white" />
        </span>
      </button>
      <button type="button" onClick={() => onJump(track)} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-sm", playing ? "text-accent" : "font-medium")}>
          {track.title}
        </span>
        <span className="block truncate text-xs text-muted">{track.artist}</span>
      </button>
      <IconButton
        label={liked ? "Remover das curtidas" : "Curtir"}
        className={cn("size-7", liked && "text-accent hover:text-accent")}
        onClick={() => onLike(track.id)}
      >
        <Heart className={cn("size-4", liked && "fill-accent")} />
      </IconButton>
    </div>
  );
}

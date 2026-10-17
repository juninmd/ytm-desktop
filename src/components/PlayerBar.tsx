import {
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { Slider } from "./ui/Slider";
import { usePlayer } from "../hooks/usePlayer";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";

type Props = { queueOpen: boolean; onToggleQueue: () => void };

export function PlayerBar({ queueOpen, onToggleQueue }: Props) {
  const {
    state,
    current,
    engine,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    isLiked,
    toggleLike,
  } = usePlayer();

  const liked = current ? isLiked(current.id) : false;
  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="flex h-[86px] shrink-0 items-center gap-4 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {current ? (
          <>
            <Cover
              seed={current.albumId || current.album}
              title={current.album}
              src={current.thumbnail}
              className="size-14 rounded-md"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{current.title}</p>
              <p className="truncate text-xs text-muted">{current.artist}</p>
            </div>
            <span
              className={cn(
                "ml-1 hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium xl:inline",
                engine === "audio"
                  ? "border-accent/40 text-accent"
                  : "border-line text-subtle",
              )}
              title={
                engine === "audio"
                  ? "Reproduzindo áudio real resolvido pelo yt-dlp"
                  : "Transporte simulado: nenhum áudio real está tocando"
              }
            >
              {engine === "audio" ? "áudio real" : "simulado"}
            </span>
            <IconButton
              label={liked ? "Remover das curtidas" : "Curtir"}
              onClick={() => toggleLike(current.id)}
              className={cn("ml-1", liked && "text-accent hover:text-accent")}
            >
              <Heart className={cn("size-4", liked && "fill-accent")} />
            </IconButton>
          </>
        ) : (
          <>
            <span className="size-14 shrink-0 rounded-md border border-line bg-raised" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted">Nenhuma faixa selecionada</p>
              <p className="text-xs text-subtle">Escolha algo na sua biblioteca</p>
            </div>
          </>
        )}
      </div>

      <div className="flex w-full max-w-[640px] flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          <IconButton label="Embaralhar" active={state.shuffle} onClick={toggleShuffle}>
            <Shuffle className="size-4" />
          </IconButton>
          <IconButton label="Faixa anterior" onClick={previous} disabled={!current}>
            <SkipBack className="size-5 fill-current" />
          </IconButton>
          <button
            type="button"
            onClick={toggle}
            disabled={!current}
            aria-label={state.isPlaying ? "Pausar" : "Tocar"}
            className="grid size-9 place-items-center rounded-full bg-white text-canvas transition hover:scale-105 active:scale-100 disabled:pointer-events-none disabled:opacity-40"
          >
            {state.isPlaying ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 translate-x-px fill-current" />
            )}
          </button>
          <IconButton label="Próxima faixa" onClick={next} disabled={!current}>
            <SkipForward className="size-5 fill-current" />
          </IconButton>
          <IconButton
            label={state.repeat === "one" ? "Repetir: uma faixa" : state.repeat === "all" ? "Repetir: tudo" : "Repetir: desligado"}
            active={state.repeat !== "off"}
            onClick={cycleRepeat}
          >
            {state.repeat === "one" ? <Repeat1 className="size-4" /> : <Repeat className="size-4" />}
          </IconButton>
        </div>

        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-[11px] text-subtle tabular-nums">
            {formatTime(state.position)}
          </span>
          <Slider
            label="Posição da faixa"
            value={state.position}
            max={current && current.duration > 0 ? current.duration : 1}
            onChange={seek}
            disabled={!current}
          />
          <span className="w-10 text-[11px] text-subtle tabular-nums">
            {formatTime(current?.duration ?? 0)}
          </span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        <IconButton label="Letra" className="hidden 2xl:grid">
          <Mic2 className="size-4" />
        </IconButton>
        <IconButton
          label={queueOpen ? "Ocultar fila" : "Mostrar fila"}
          active={queueOpen}
          onClick={onToggleQueue}
        >
          <ListMusic className="size-4" />
        </IconButton>
        <IconButton label={state.muted ? "Ativar som" : "Silenciar"} onClick={toggleMute}>
          <VolumeIcon className="size-4" />
        </IconButton>
        <Slider
          label="Volume"
          className="max-w-[110px]"
          value={state.muted ? 0 : state.volume}
          max={1}
          onChange={setVolume}
        />
      </div>
    </footer>
  );
}

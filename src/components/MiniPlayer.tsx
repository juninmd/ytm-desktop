import {
  Eye,
  EyeOff,
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Pin,
  PinOff,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { Slider } from "./ui/Slider";
import { usePlayer } from "../hooks/usePlayer";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import { useI18n } from "../lib/i18n";

type Props = {
  pinned: boolean;
  onTogglePin: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  /** Controls fade out until the pointer or keyboard focus is on the strip. */
  autoHide: boolean;
  onToggleAutoHide: () => void;
  onExit: () => void;
};

/** The compact strip: artwork, what is playing, a seek bar and the transport. */
export function MiniPlayer({
  pinned,
  onTogglePin,
  queueOpen,
  onToggleQueue,
  autoHide,
  onToggleAutoHide,
  onExit,
}: Props) {
  const { state, current, upNext, toggle, next, previous, seek, setVolume, toggleMute, isLiked, toggleLike, jump, dequeue } =
    usePlayer();
  const { t } = useI18n();
  const liked = current ? isLiked(current.id) : false;
  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2;

  return (
    // Everything that is not a control drags the native window.
    <div data-tauri-drag-region data-mini className="group flex h-full flex-col bg-panel">
      <div data-tauri-drag-region className="flex h-[150px] shrink-0 items-center gap-3 p-3">
        {current ? (
          <Cover
            seed={current.albumId || current.album}
            title={current.album}
            src={current.thumbnail}
            className="pointer-events-none size-[104px] shrink-0 rounded-md"
          />
        ) : (
          <span className="pointer-events-none size-[104px] shrink-0 rounded-md border border-line bg-raised" />
        )}

        <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 flex-col justify-between">
          <div data-tauri-drag-region className="flex items-start gap-1">
            <div data-tauri-drag-region className="min-w-0 flex-1">
              <p data-tauri-drag-region className="truncate text-sm font-medium">
                {current ? current.title : t("player.nothing")}
              </p>
              <p data-tauri-drag-region className="truncate text-xs text-muted">
                {current ? current.artist : t("player.nothingHint")}
              </p>
            </div>
            <IconButton
              label={autoHide ? t("mini.autoHideOff") : t("mini.autoHideOn")}
              active={autoHide}
              className="size-7"
              onClick={onToggleAutoHide}
            >
              {autoHide ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </IconButton>
            <IconButton
              label={pinned ? t("mini.unpin") : t("mini.pin")}
              active={pinned}
              className="size-7"
              onClick={onTogglePin}
            >
              {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
            </IconButton>
            <IconButton label={t("mini.exit")} className="size-7" onClick={onExit}>
              <Maximize2 className="size-3.5" />
            </IconButton>
          </div>

          <div
            data-controls
            className={cn(
              "flex flex-col gap-2 transition-opacity duration-200",
              autoHide && "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="w-9 text-right text-[11px] text-subtle tabular-nums">
                {formatTime(state.position)}
              </span>
              <Slider
                label={t("player.position")}
                value={state.position}
                max={current && current.duration > 0 ? current.duration : 1}
                onChange={seek}
                disabled={!current}
              />
              <span className="w-9 text-[11px] text-subtle tabular-nums">
                {formatTime(current?.duration ?? 0)}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <IconButton label={t("player.previous")} hint="P" onClick={previous} disabled={!current}>
                <SkipBack className="size-4 fill-current" />
              </IconButton>
              <button
                type="button"
                onClick={toggle}
                disabled={!current}
                aria-label={state.isPlaying ? t("player.pause") : t("player.play")}
                className="grid size-8 place-items-center rounded-full bg-white text-canvas transition hover:scale-105 active:scale-100 disabled:pointer-events-none disabled:opacity-40"
              >
                {state.isPlaying ? (
                  <Pause className="size-4 fill-current" />
                ) : (
                  <Play className="size-4 translate-x-px fill-current" />
                )}
              </button>
              <IconButton label={t("player.next")} hint="N" onClick={next} disabled={!current}>
                <SkipForward className="size-4 fill-current" />
              </IconButton>
              <IconButton
                label={liked ? t("player.unlike") : t("player.like")}
                hint="L"
                onClick={() => current && toggleLike(current.id)}
                disabled={!current}
                className={cn(liked && "text-accent hover:text-accent")}
              >
                <Heart className={cn("size-4", liked && "fill-accent")} />
              </IconButton>
              <IconButton
                label={queueOpen ? t("player.hideQueue") : t("player.showQueue")}
                hint="Q"
                active={queueOpen}
                onClick={onToggleQueue}
              >
                <ListMusic className="size-4" />
              </IconButton>
              <span data-tauri-drag-region className="flex-1" />
              <IconButton label={state.muted ? t("player.unmute") : t("player.mute")} hint="M" onClick={toggleMute}>
                <VolumeIcon className="size-4" />
              </IconButton>
              <div className="w-12">
                <Slider
                  label={t("player.volume")}
                  value={state.muted ? 0 : state.volume}
                  max={1}
                  onChange={setVolume}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {queueOpen && (
        <div data-mini-queue className="scroll-area min-h-0 flex-1 overflow-y-auto border-t border-line px-2 py-1.5">
          {upNext.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted">{t("queue.nothingNext")}</p>
          ) : (
            upNext.map((track, index) => (
              <div
                key={`${track.id}-${index}`}
                className="group/row flex items-center gap-2.5 rounded-md p-1.5 hover:bg-hover"
              >
                <button
                  type="button"
                  onClick={() => jump(state.cursor + 1 + index)}
                  aria-label={t("track.play", { title: track.title })}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Cover
                    seed={track.albumId || track.album}
                    title={track.album}
                    src={track.thumbnail}
                    className="size-9"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{track.title}</span>
                    <span className="block truncate text-[11px] text-muted">{track.artist}</span>
                  </span>
                </button>
                <IconButton
                  label={t("menu.remove")}
                  className="size-6 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                  onClick={() => dequeue(state.cursor + 1 + index)}
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

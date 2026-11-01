import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize, Minimize, Music2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { Slider } from "./ui/Slider";
import { useLyrics } from "../hooks/useLyrics";
import { usePlayer } from "../hooks/usePlayer";
import { cn } from "../lib/cn";
import { coverStyle } from "../lib/cover";
import { setFullscreen } from "../lib/fullscreen";
import { formatTime } from "../lib/format";
import { useI18n } from "../lib/i18n";

/**
 * The lyrics as a full-window stage: big artwork, the current line enlarged and
 * the rest dimmed, over a blurred wash of the cover. Clicking a line seeks, and
 * the window can go fullscreen. Nothing here is faked: unsynchronised lyrics are
 * shown as plain text with no highlighted line.
 */
export function LyricsCinema({ onClose }: { onClose: () => void }) {
  const { state, toggle, next, previous, seek } = usePlayer();
  const { current, lyrics, error, activeIndex } = useLyrics();
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (activeIndex < 0) return;
    scroller.current
      ?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Leaving the stage leaves fullscreen too: the main window never stays stranded in it.
  useEffect(
    () => () => {
      void setFullscreen(false).catch(() => {});
    },
    [],
  );

  const toggleFull = () => {
    const target = !full;
    setFull(target);
    void setFullscreen(target).catch(() => setFull(!target));
  };

  return (
    <div
      role="dialog"
      aria-label={t("cinema.title")}
      data-cinema
      className="fixed inset-0 z-[65] flex flex-col overflow-hidden bg-canvas"
    >
      {/* A blurred wash of the cover, or of its generated sleeve when there is none. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 scale-125 opacity-60 blur-3xl">
        {current?.thumbnail ? (
          <img src={current.thumbnail} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          <div className="size-full" style={coverStyle(current?.albumId || current?.album || "idle")} />
        )}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/60" />

      <header className="relative flex items-center justify-end gap-1 p-4">
        <IconButton label={full ? t("cinema.exitFullscreen") : t("cinema.fullscreen")} onClick={toggleFull}>
          {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </IconButton>
        <IconButton label={t("cinema.close")} hint="Esc" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center gap-10 px-10 pb-4 max-md:flex-col max-md:gap-4">
        {current && (
          <div className="flex w-[min(34vw,340px)] shrink-0 flex-col gap-4 max-md:w-32">
            <Cover
              seed={current.albumId || current.album}
              title={current.album}
              src={current.thumbnail}
              className="aspect-square w-full rounded-lg shadow-[0_20px_60px_rgb(0_0_0/0.5)]"
            />
            <div className="min-w-0 max-md:hidden">
              <p className="truncate text-xl font-semibold">{current.title}</p>
              <p className="truncate text-sm text-muted">{current.artist}</p>
            </div>
          </div>
        )}

        <div
          ref={scroller}
          className="scroll-area h-full min-w-0 flex-1 overflow-y-auto py-[30vh]"
          aria-live={lyrics?.synced ? "off" : "polite"}
        >
          {!current ? (
            <p className="grid place-items-center text-center text-muted">
              <Music2 className="mb-3 size-6" />
              {t("lyrics.empty")}
            </p>
          ) : error && !lyrics ? (
            <p className="text-lg text-muted">{error}</p>
          ) : !lyrics ? (
            <Loader2 className="size-6 animate-spin text-muted" />
          ) : (
            lyrics.lines.map((line, index) => {
              if (line.text.length === 0) return <div key={index} className="h-6" />;
              const active = lyrics.synced && index === activeIndex;
              return (
                <button
                  key={index}
                  type="button"
                  data-line={index}
                  disabled={!lyrics.synced}
                  onClick={() => lyrics.synced && seek(line.time)}
                  className={cn(
                    "block w-full origin-left py-2 text-left leading-tight transition-all duration-300",
                    lyrics.synced ? "cursor-pointer" : "cursor-default",
                    lyrics.synced
                      ? active
                        ? "text-4xl font-bold text-fg"
                        : "text-3xl font-semibold text-fg/35 hover:text-fg/70"
                      : "text-2xl font-medium text-fg/85",
                  )}
                >
                  {line.text}
                </button>
              );
            })
          )}
        </div>
      </div>

      <footer className="relative mx-auto flex w-full max-w-2xl items-center gap-3 px-6 pb-5">
        <IconButton label={t("player.previous")} hint="P" onClick={previous} disabled={!current}>
          <SkipBack className="size-5 fill-current" />
        </IconButton>
        <button
          type="button"
          onClick={toggle}
          disabled={!current}
          aria-label={state.isPlaying ? t("player.pause") : t("player.play")}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-canvas transition hover:scale-105 disabled:opacity-40"
        >
          {state.isPlaying ? <Pause className="size-5 fill-current" /> : <Play className="size-5 translate-x-px fill-current" />}
        </button>
        <IconButton label={t("player.next")} hint="N" onClick={next} disabled={!current}>
          <SkipForward className="size-5 fill-current" />
        </IconButton>
        <span className="w-10 text-right text-xs text-subtle tabular-nums">{formatTime(state.position)}</span>
        <Slider
          label={t("player.position")}
          value={state.position}
          max={current && current.duration > 0 ? current.duration : 1}
          onChange={seek}
          disabled={!current}
        />
        <span className="w-10 text-xs text-subtle tabular-nums">{formatTime(current?.duration ?? 0)}</span>
      </footer>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Loader2, Maximize2, Mic2, Music2, X } from "lucide-react";
import { useLyrics } from "../hooks/useLyrics";
import { usePlayer } from "../hooks/usePlayer";
import { IconButton } from "./ui/IconButton";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";

/**
 * Karaoke lyrics panel.
 *
 * When the source is synchronised (LRC from LRCLIB) the current line is
 * highlighted and kept centred, and clicking a line seeks to it. When only the
 * official plain text is available it is shown as-is — no fake sync — and the
 * panel names the source it used.
 */
export function LyricsPanel({ onClose, onCinema }: { onClose: () => void; onCinema: () => void }) {
  const { seek } = usePlayer();
  const { current, lyrics, error, activeIndex } = useLyrics();
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeIndex < 0 || !lyrics?.synced) return;
    const node = scroller.current?.querySelector<HTMLElement>(`[data-line="${activeIndex}"]`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, lyrics]);

  return (
    <aside className="rounded-panel flex w-[360px] shrink-0 flex-col bg-panel">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Mic2 className="size-4" />
          {t("lyrics.title")}
        </h2>
        <div className="flex items-center gap-0.5">
          <IconButton label={t("cinema.open")} hint="C" className="size-7" onClick={onCinema} disabled={!current}>
            <Maximize2 className="size-4" />
          </IconButton>
          <IconButton label={t("lyrics.close")} className="size-7" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
      </header>

      {!current ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <Music2 className="size-6 text-subtle" />
          <p className="mt-3 text-sm text-muted">{t("lyrics.empty")}</p>
        </div>
      ) : error && !lyrics ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="text-sm text-muted">{error}</p>
        </div>
      ) : !lyrics ? (
        <div className="grid flex-1 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted" />
        </div>
      ) : (
        <>
          <div className="px-4 pb-2">
            <p className="truncate text-xs text-subtle">
              {current.title} · {current.artist}
            </p>
            <p className="mt-0.5 text-[11px] text-subtle">
              {lyrics.synced ? `${t("lyrics.synced")} · ${lyrics.source}` : `${t("lyrics.plain")} · ${lyrics.source}`}
            </p>
            {lyrics.source.toLowerCase().includes("lrclib") && (
              <p className="mt-0.5 text-[11px] text-subtle/80">
                {t("lyrics.source")}
              </p>
            )}
          </div>

          <div
            ref={scroller}
            className="scroll-area min-h-0 flex-1 overflow-y-auto px-4 pb-10"
            aria-live={lyrics.synced ? "off" : "polite"}
          >
            {lyrics.lines.map((line, index) => {
              const active = lyrics.synced && index === activeIndex;
              const past = lyrics.synced && index < activeIndex;
              return line.text.length === 0 ? (
                <div key={index} className="h-3" />
              ) : (
                <button
                  key={index}
                  type="button"
                  data-line={index}
                  onClick={() => lyrics.synced && seek(line.time)}
                  disabled={!lyrics.synced}
                  className={cn(
                    "block w-full py-1.5 text-left text-base leading-snug transition-colors",
                    lyrics.synced ? "cursor-pointer" : "cursor-default",
                    active
                      ? "font-semibold text-accent"
                      : past
                        ? "text-fg/50 hover:text-fg"
                        : "text-fg/85 hover:text-fg",
                  )}
                >
                  {line.text}
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

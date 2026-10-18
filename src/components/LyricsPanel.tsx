import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic2, Music2, X } from "lucide-react";
import { fetchLyrics, type Lyrics } from "../lib/music";
import { usePlayer } from "../hooks/usePlayer";
import { IconButton } from "./ui/IconButton";
import { cn } from "../lib/cn";

/**
 * Karaoke lyrics panel.
 *
 * When the source is synchronised (LRC from LRCLIB) the current line is
 * highlighted and kept centred, and clicking a line seeks to it. When only the
 * official plain text is available it is shown as-is — no fake sync — and the
 * panel names the source it used.
 */
export function LyricsPanel({ onClose }: { onClose: () => void }) {
  const { current, state, seek } = usePlayer();
  const [loaded, setLoaded] = useState<{ id: string; lyrics: Lyrics } | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const cache = useRef(new Map<string, Lyrics>());

  // A stable key: the query only changes when the track changes, not on every
  // playback tick.
  const query = useMemo(
    () =>
      current
        ? {
            id: current.id,
            title: current.title,
            artist: current.artist,
            album: current.album,
            duration: current.duration,
          }
        : null,
    // The track's other fields are constant for a given id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id],
  );

  useEffect(() => {
    if (!query) {
      setLoaded(null);
      return;
    }
    const cached = cache.current.get(query.id);
    if (cached) {
      setLoaded({ id: query.id, lyrics: cached });
      return;
    }

    let cancelled = false;
    setFailed(null);
    void fetchLyrics(query)
      .then((result) => {
        if (cancelled) return;
        cache.current.set(query.id, result);
        setLoaded({ id: query.id, lyrics: result });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFailed({
          id: query.id,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  // Only ever render lyrics that belong to the track on screen, so switching
  // tracks cannot flash the previous song's lines.
  const lyrics = loaded && query && loaded.id === query.id ? loaded.lyrics : null;
  const error = failed && query && failed.id === query.id ? failed.message : null;

  // Index of the line being sung right now (last line at or before the playhead).
  const activeIndex = useMemo(() => {
    if (!lyrics?.synced) return -1;
    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i += 1) {
      if (lyrics.lines[i].time <= state.position + 0.15) index = i;
      else break;
    }
    return index;
  }, [lyrics, state.position]);

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
          Letra
        </h2>
        <IconButton label="Fechar letra" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      {!current ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <Music2 className="size-6 text-subtle" />
          <p className="mt-3 text-sm text-muted">Escolha uma faixa para ver a letra.</p>
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
              {lyrics.synced ? `Sincronizada · ${lyrics.source}` : `Sem sincronia · ${lyrics.source}`}
            </p>
            {lyrics.source.toLowerCase().includes("lrclib") && (
              <p className="mt-0.5 text-[11px] text-subtle/80">
                Letras via LRCLIB (lrclib.net) — artista, título e álbum são enviados para a busca.
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

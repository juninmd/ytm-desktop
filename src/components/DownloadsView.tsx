import { Download, Trash2 } from "lucide-react";
import { EmptyState } from "@juninmd/sonido";
import { useCatalog } from "../hooks/useCatalog";
import { usePlayer } from "../hooks/usePlayer";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";
import { formatBytes, formatTime } from "../lib/format";

/**
 * Tracks saved to disk for offline playback. Playing starts the downloaded
 * queue; the player prefers the local file over the network.
 */
export function DownloadsView() {
  const { downloads, downloadTracks, removeDownload } = useCatalog();
  const { play, current, state, notify } = usePlayer();
  const { t } = useI18n();

  if (downloads.length === 0) {
    return (
      <div className="px-6 py-6">
        <EmptyState
          icon={<Download className="size-7" />}
          title={t("downloads.title")}
          description={t("downloads.empty")}
          titleAs="h1"
        />
      </div>
    );
  }

  const totalBytes = downloads.reduce((sum, entry) => sum + entry.bytes, 0);

  return (
    <div className="px-6 pb-10">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("downloads.title")}</h1>
      <p className="mt-1 text-sm text-muted">
        {t(downloads.length === 1 ? "downloads.countOne" : "downloads.count", { count: downloads.length, size: formatSize(totalBytes) })}
      </p>

      <div className="mt-6 rounded-lg bg-black/25 py-2">
        {downloads.map((entry, index) => {
          const playing = current?.id === entry.id;
          return (
            <div
              key={entry.id}
              className={cn(
                "group flex items-center gap-3 rounded-md px-4 py-2 transition-colors hover:bg-white/6",
                playing && "bg-white/6",
              )}
            >
              <button
                type="button"
                onClick={() => play(downloadTracks, index)}
                aria-label={t("track.play", { title: entry.title })}
                className="relative shrink-0"
              >
                <Cover seed={entry.id} title={entry.album || entry.title} className="size-10" />
              </button>
              <button
                type="button"
                onClick={() => play(downloadTracks, index)}
                className="min-w-0 flex-1 text-left text-sm"
              >
                <span className={cn("block truncate font-medium", playing && "text-accent")}>
                  {entry.title}
                </span>
                <span className="block truncate text-xs text-muted">
                  {entry.artist}
                  {entry.album ? ` · ${entry.album}` : ""}
                </span>
              </button>
              <span className="hidden text-xs text-subtle tabular-nums sm:block">
                {formatSize(entry.bytes)}
              </span>
              <span className="w-10 text-right text-xs text-muted tabular-nums">
                {entry.duration > 0 ? formatTime(entry.duration) : "--:--"}
              </span>
              <IconButton
                label={t("downloads.remove", { title: entry.title })}
                onClick={() =>
                  void removeDownload(entry.id).catch(() =>
                    notify(t("downloads.removeFailed", { title: entry.title })),
                  )
                }
                className={cn(
                  "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                  playing && state.isPlaying && "opacity-100",
                )}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Unknown size (0) shows a dash; real sizes use the shared binary-unit formatter. */
function formatSize(bytes: number): string {
  return bytes > 0 ? formatBytes(bytes) : "—";
}

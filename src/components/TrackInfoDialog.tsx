import { Cover } from "./Cover";
import { Modal } from "./ui/Modal";
import { useCatalog } from "../hooks/useCatalog";
import { formatBytes, formatTime } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Track } from "../types";

/**
 * What the catalogue knows about a track. Nothing here is invented: a field the
 * catalogue did not supply is left out instead of shown as a placeholder.
 */
export function TrackInfoDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const { t } = useI18n();
  const { downloads } = useCatalog();
  const saved = downloads.find((entry) => entry.id === track.id);

  const entries: [string, string][] = [
    [t("info.artist"), track.artist],
    [t("info.album"), track.album],
    [t("info.year"), track.year > 0 ? String(track.year) : ""],
    [t("info.duration"), track.duration > 0 ? formatTime(track.duration) : ""],
    [t("info.plays"), track.plays],
    [t("info.offline"), saved ? t("info.offlineYes", { size: formatBytes(saved.bytes) }) : t("info.offlineNo")],
    [t("info.id"), track.id],
  ];
  const rows = entries.filter(([, value]) => value);

  return (
    <Modal title={t("info.title")} closeLabel={t("info.close")} onClose={onClose} className="max-w-md">
      <div className="mb-4 flex items-center gap-3">
        <Cover
          seed={track.albumId || track.album}
          title={track.album}
          src={track.thumbnail}
          className="size-16"
        />
        <p className="min-w-0 text-base font-medium">{track.title}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="min-w-0 break-words select-text">{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

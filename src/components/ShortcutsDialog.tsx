import { Kbd } from "@juninmd/sonido";
import { Modal } from "./ui/Modal";
import { SHORTCUTS } from "../lib/shortcuts";
import { useI18n } from "../lib/i18n";

const CLOSE_KEYS = ["?"];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t("keys.title")} onClose={onClose} closeKeys={CLOSE_KEYS}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.command}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
          >
            <dt className="min-w-0 truncate text-sm text-fg/85">{t(shortcut.label)}</dt>
            <dd className="flex shrink-0 gap-1">
              {shortcut.keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { SHORTCUTS } from "../lib/shortcuts";
import { useI18n } from "../lib/i18n";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);

  // Focus moves in and is handed back on close; Tab cannot leave the dialog.
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // On the window, not the panel: a click on the dialog's text moves focus to
  // the body, and Escape must keep working from there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault(); // the close button is the only stop
        panel.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t("keys.title")}
        className="w-full max-w-xl rounded-2xl border border-line-strong bg-panel p-5 shadow-[0_24px_60px_rgb(0_0_0/0.6)]"
      >
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("keys.title")}</h2>
          <IconButton label={t("keys.close")} onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.command}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
            >
              <dt className="min-w-0 truncate text-sm text-fg/85">{t(shortcut.label)}</dt>
              <dd className="flex shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-line-strong bg-raised px-1.5 py-0.5 font-sans text-[11px] text-muted"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

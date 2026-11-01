import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

type Props = {
  title: string;
  closeLabel: string;
  onClose: () => void;
  /** Keys, besides Escape, that also close the dialog (e.g. `?` for its own help sheet). */
  closeKeys?: string[];
  className?: string;
  children: ReactNode;
};

/**
 * A modal dialog: focus moves in and is handed back on close, Tab cannot leave
 * it, and Escape closes it even after a click moved focus to the body (the key
 * is read on the window, not on the panel).
 */
export function Modal({ title, closeLabel, onClose, closeKeys = [], className = "max-w-xl", children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || closeKeys.includes(event.key)) {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault(); // the close button is the only stop
        panel.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, closeKeys]);

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
        aria-label={title}
        className={`w-full rounded-2xl border border-line-strong bg-panel p-5 shadow-[0_24px_60px_rgb(0_0_0/0.6)] ${className}`}
      >
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
          <IconButton label={closeLabel} onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}

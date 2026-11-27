import { useEffect, type ReactNode } from "react";
import { Dialog } from "@juninmd/sonido";
import { cn } from "../../lib/cn";

type Props = {
  title: string;
  onClose: () => void;
  /** Keys, besides Escape, that also close the dialog (e.g. `?` for its own help sheet). */
  closeKeys?: string[];
  className?: string;
  children: ReactNode;
};

/**
 * Modal dialog, rendered by Sonido's native `<dialog>` based `Dialog`: focus is
 * trapped by the browser, Escape cancels, and the backdrop click closes.
 *
 * Sonido owns Escape; the app's extra dismiss keys (the sheet closes on `?`)
 * stay here. Pass `app-dialog--sm` in `className` for the narrow variant.
 */
export function Modal({ title, onClose, closeKeys = [], className, children }: Props) {
  useEffect(() => {
    if (closeKeys.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (closeKeys.includes(event.key)) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeKeys, onClose]);

  return (
    <Dialog open onClose={onClose} title={title} className={cn("app-dialog", className)}>
      {children}
    </Dialog>
  );
}

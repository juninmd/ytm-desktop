import { useCallback, useRef, useState, type ReactNode } from "react";
import { Menu, type MenuAnchor, type MenuItem } from "./Menu";

type Open = { label: string; items: MenuItem[]; anchor: MenuAnchor };

/** A trigger click this soon after its own menu was dismissed is the dismissing click. */
const REOPEN_GUARD_MS = 300;

/** One menu at a time per host: `show` opens it, `node` is rendered anywhere in the tree. */
export function useMenu(): {
  show: (label: string, items: MenuItem[], anchor: MenuAnchor) => void;
  /** For a button that owns the menu: a second click closes it instead of reopening. */
  toggle: (label: string, items: MenuItem[], anchor: MenuAnchor) => void;
  node: ReactNode;
} {
  const [open, setOpen] = useState<Open | null>(null);
  const closed = useRef<{ label: string; at: number } | null>(null);

  const close = useCallback((reason?: "outside") => {
    setOpen((current) => {
      if (current && reason === "outside") {
        closed.current = { label: current.label, at: performance.now() };
      }
      return null;
    });
  }, []);
  const show = useCallback(
    (label: string, items: MenuItem[], anchor: MenuAnchor) => setOpen({ label, items, anchor }),
    [],
  );
  const toggle = useCallback(
    (label: string, items: MenuItem[], anchor: MenuAnchor) => {
      const last = closed.current;
      // The outside-pointerdown already closed this menu; this click must not undo that.
      if (last && last.label === label && performance.now() - last.at < REOPEN_GUARD_MS) return;
      show(label, items, anchor);
    },
    [show],
  );
  return { show, toggle, node: open ? <Menu {...open} onClose={close} /> : null };
}

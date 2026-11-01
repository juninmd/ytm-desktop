import { useCallback, useState, type ReactNode } from "react";
import { Menu, type MenuAnchor, type MenuItem } from "./Menu";

type Open = { label: string; items: MenuItem[]; anchor: MenuAnchor };

/** One menu at a time per host: `show` opens it, `node` is rendered anywhere in the tree. */
export function useMenu(): {
  show: (label: string, items: MenuItem[], anchor: MenuAnchor) => void;
  node: ReactNode;
} {
  const [open, setOpen] = useState<Open | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const show = useCallback(
    (label: string, items: MenuItem[], anchor: MenuAnchor) => setOpen({ label, items, anchor }),
    [],
  );
  return { show, node: open ? <Menu {...open} onClose={close} /> : null };
}

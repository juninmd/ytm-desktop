import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export type MenuItem =
  | {
      id: string;
      label: string;
      icon?: ReactNode;
      /** The item's keyboard shortcut, shown at the right edge. */
      hint?: string;
      /** Renders a check mark: the item is a choice among several. */
      checked?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { id: string; separator: true }
  | { id: string; heading: string };

export type MenuAnchor = {
  x: number;
  y: number;
  /** `up` opens above the anchor (for controls pinned to the bottom edge). */
  direction?: "down" | "up";
  /** `end` right-aligns the menu to the anchor (for controls on the right edge). */
  align?: "start" | "end";
};

const EDGE = 8;

/** Where a menu should open for a pointer event, or for the element on keyboard use. */
export function anchorFromEvent(event: ReactMouseEvent<HTMLElement>): MenuAnchor {
  // A keyboard-triggered contextmenu reports (0, 0): anchor to the element.
  if (event.clientX === 0 && event.clientY === 0) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left + 24, y: rect.bottom };
  }
  return { x: event.clientX, y: event.clientY };
}

/** Anchors to a button's edge so the menu stays attached to it. */
export function anchorFromElement(
  element: HTMLElement,
  direction: "down" | "up" = "down",
  align: "start" | "end" = "start",
): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x: align === "end" ? rect.right : rect.left,
    y: direction === "up" ? rect.top - 6 : rect.bottom + 6,
    direction,
    align,
  };
}

type Props = {
  label: string;
  items: MenuItem[];
  anchor: MenuAnchor;
  /** `outside` means the user pressed elsewhere (as opposed to choosing or Escape). */
  onClose: (reason?: "outside") => void;
};

export function Menu({ label, items, anchor, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // The element that had focus before the menu opened gets it back on close.
  const opener = useRef<Element | null>(document.activeElement);

  const close = useCallback(() => {
    onClose();
    if (opener.current instanceof HTMLElement) opener.current.focus();
  }, [onClose]);

  // Measured after mount so the menu can flip and clamp into the viewport.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    let left = anchor.align === "end" ? anchor.x - width : anchor.x;
    let top = anchor.direction === "up" ? anchor.y - height : anchor.y;
    left = Math.min(Math.max(EDGE, left), window.innerWidth - width - EDGE);
    top = Math.min(Math.max(EDGE, top), window.innerHeight - height - EDGE);
    setPosition({ left, top });
  }, [anchor, items.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus();
  }, []);

  useEffect(() => {
    const away = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose("outside");
    };
    const dismiss = () => onClose();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("wheel", dismiss, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("wheel", dismiss);
    };
  }, [onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [],
    );
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      nodes[(to + nodes.length) % nodes.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index < 0 ? -1 : index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(-1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        event.preventDefault();
        close();
        break;
      default:
        break;
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
      className={cn(
        "fixed z-[60] min-w-52 max-w-72 rounded-lg border border-line-strong bg-raised p-1",
        "shadow-[0_16px_40px_rgb(0_0_0/0.55)]",
        // Hidden for the one frame it takes to measure, so it never flashes at (0, 0).
        position ? "opacity-100" : "opacity-0",
      )}
    >
      {items.map((item) => {
        if ("separator" in item) {
          return <div key={item.id} role="separator" className="my-1 h-px bg-line" />;
        }
        if ("heading" in item) {
          return (
            <p key={item.id} role="presentation" className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
              {item.heading}
            </p>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              close();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-fg/90",
              "hover:bg-hover focus-visible:bg-hover focus-visible:outline-none",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <span className="grid size-4 shrink-0 place-items-center text-muted">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && (
              <kbd className="shrink-0 rounded border border-line-strong px-1 font-sans text-[10px] text-subtle">
                {item.hint}
              </kbd>
            )}
            {item.checked && <Check className="size-4 shrink-0 text-accent" />}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

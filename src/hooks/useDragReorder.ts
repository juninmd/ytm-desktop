import { useCallback, useEffect, useRef, useState } from "react";

/** The row under vertical position `y`, clamped to the first/last row. */
export function indexAtY(rows: { top: number; bottom: number }[], y: number): number {
  if (rows.length === 0) return 0;
  const hit = rows.findIndex((row) => y >= row.top && y < row.bottom);
  if (hit >= 0) return hit;
  return y < rows[0].top ? 0 : rows.length - 1;
}

export type Drag = { from: number; over: number };

/**
 * Pointer-driven reorder for a list. Built on pointer events rather than HTML
 * drag-and-drop because the desktop shell can intercept the latter for file
 * drops; Escape cancels, and a drop on the same row is a no-op.
 *
 * Rows must carry the `data-reorder-row` attribute inside `container`.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const container = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const stop = useRef<(() => void) | null>(null);

  // A list that unmounts mid-drag must not leave window listeners behind.
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (from: number) => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      let over = from;
      setDrag({ from, over });

      const move = (pointer: PointerEvent) => {
        const rows = Array.from(
          container.current?.querySelectorAll<HTMLElement>("[data-reorder-row]") ?? [],
        ).map((row) => row.getBoundingClientRect());
        const next = indexAtY(rows, pointer.clientY);
        if (next !== over) {
          over = next;
          setDrag({ from, over });
        }
      };
      const finish = (commit: boolean) => {
        cleanup();
        setDrag(null);
        if (commit && over !== from) onMove(from, over);
      };
      const up = () => finish(true);
      const key = (keyboard: KeyboardEvent) => {
        if (keyboard.key === "Escape") finish(false);
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key);
        stop.current = null;
      };
      const cancel = () => finish(false);

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key);
      stop.current = cleanup;
    },
    [onMove],
  );

  return { container, drag, start };
}

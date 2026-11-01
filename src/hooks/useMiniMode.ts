import { useCallback, useEffect, useRef, useState } from "react";
import { enterMiniWindow, exitMiniWindow, pinMiniWindow } from "../lib/miniWindow";

/**
 * Mini mode: the workspace gives way to a compact player strip and, on the
 * desktop build, the native window shrinks to match (and stays on top while
 * pinned). If the window cannot be resized the layout still switches, so the
 * mode degrades to "small UI in a big window" instead of failing.
 */
export function useMiniMode(onWindowError: () => void) {
  const [mini, setMini] = useState(false);
  const [pinned, setPinned] = useState(true);
  const miniRef = useRef(mini);
  miniRef.current = mini;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const busy = useRef(false);
  const errorRef = useRef(onWindowError);
  errorRef.current = onWindowError;

  const toggle = useCallback(async () => {
    if (busy.current) return; // a double press must not interleave two resizes
    busy.current = true;
    const target = !miniRef.current;
    try {
      if (target) await enterMiniWindow(pinnedRef.current);
      else await exitMiniWindow();
    } catch {
      errorRef.current();
    } finally {
      setMini(target);
      busy.current = false;
    }
  }, []);

  const togglePin = useCallback(() => {
    const next = !pinnedRef.current;
    setPinned(next);
    if (miniRef.current) void pinMiniWindow(next).catch(() => errorRef.current());
  }, []);

  // Closing the shell while mini must not strand the next launch in a tiny window.
  useEffect(
    () => () => {
      if (miniRef.current) void exitMiniWindow().catch(() => {});
    },
    [],
  );

  return { mini, pinned, toggle, togglePin };
}

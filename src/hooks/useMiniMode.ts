import { useCallback, useEffect, useRef, useState } from "react";
import { enterMiniWindow, exitMiniWindow, pinMiniWindow, resizeMiniWindow } from "../lib/miniWindow";

const AUTO_HIDE_KEY = "ytm-desktop:mini-autohide";

function readAutoHide(): boolean {
  try {
    return localStorage.getItem(AUTO_HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Mini mode: the workspace gives way to a compact player strip and, on the
 * desktop build, the native window shrinks to match (and stays on top while
 * pinned). If the window cannot be resized the layout still switches, so the
 * mode degrades to "small UI in a big window" instead of failing.
 */
export function useMiniMode(onWindowError: () => void) {
  const [mini, setMini] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [autoHide, setAutoHide] = useState(readAutoHide);
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
      setQueueOpen(false); // the list always starts closed, and the window has been reset
      setMini(target);
      busy.current = false;
    }
  }, []);

  const togglePin = useCallback(() => {
    const next = !pinnedRef.current;
    setPinned(next);
    if (miniRef.current) void pinMiniWindow(next).catch(() => errorRef.current());
  }, []);

  const queueRef = useRef(queueOpen);
  queueRef.current = queueOpen;
  const toggleQueue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const target = !queueRef.current;
    setQueueOpen(target); // the list shows at once; the window follows
    try {
      await resizeMiniWindow(target);
    } catch {
      errorRef.current();
    } finally {
      busy.current = false;
    }
  }, []);

  const toggleAutoHide = useCallback(() => {
    setAutoHide((current) => {
      try {
        localStorage.setItem(AUTO_HIDE_KEY, current ? "0" : "1");
      } catch {
        // Remembering the choice is a nicety, never a failure.
      }
      return !current;
    });
  }, []);

  // Closing the shell while mini must not strand the next launch in a tiny window.
  useEffect(
    () => () => {
      if (miniRef.current) void exitMiniWindow().catch(() => {});
    },
    [],
  );

  return { mini, pinned, queueOpen, autoHide, toggle, togglePin, toggleQueue, toggleAutoHide };
}

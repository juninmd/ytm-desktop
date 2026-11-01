import { isDesktop } from "./auth";

/** Inner size of the mini window, in logical pixels. */
export const MINI_SIZE = { width: 420, height: 150 } as const;

/** The full window's floor; mirrors `minWidth`/`minHeight` in tauri.conf.json. */
export const FULL_MIN_SIZE = { width: 940, height: 620 } as const;

type Bounds = { width: number; height: number; x: number; y: number };

/** Where the full window was, so leaving mini mode puts it back exactly there. */
let saved: Bounds | null = null;

async function api() {
  const [{ getCurrentWindow }, { LogicalPosition, LogicalSize }] = await Promise.all([
    import("@tauri-apps/api/window"),
    import("@tauri-apps/api/dpi"),
  ]);
  return { window: getCurrentWindow(), LogicalPosition, LogicalSize };
}

/** Shrinks the native window to the mini strip. A no-op in the browser preview. */
export async function enterMiniWindow(pinned: boolean): Promise<void> {
  if (!isDesktop()) return;
  const { window, LogicalSize } = await api();

  // A maximized window ignores `setSize`; leave that state first.
  if (await window.isMaximized()) await window.unmaximize();
  if (!saved) {
    const scale = await window.scaleFactor();
    const size = (await window.innerSize()).toLogical(scale);
    const position = (await window.outerPosition()).toLogical(scale);
    saved = { width: size.width, height: size.height, x: position.x, y: position.y };
  }
  // The minimum goes first, or the shrink is clamped to the full window's floor.
  await window.setMinSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
  await window.setSize(new LogicalSize(MINI_SIZE.width, MINI_SIZE.height));
  await window.setAlwaysOnTop(pinned);
}

/** Restores the full window's size, position and floor. */
export async function exitMiniWindow(): Promise<void> {
  if (!isDesktop()) return;
  const { window, LogicalPosition, LogicalSize } = await api();

  await window.setAlwaysOnTop(false);
  await window.setMinSize(new LogicalSize(FULL_MIN_SIZE.width, FULL_MIN_SIZE.height));
  if (saved) {
    await window.setSize(new LogicalSize(saved.width, saved.height));
    await window.setPosition(new LogicalPosition(saved.x, saved.y));
    saved = null;
  }
}

/** Keeps the mini window above (or below) the others. */
export async function pinMiniWindow(pinned: boolean): Promise<void> {
  if (!isDesktop()) return;
  const { window } = await api();
  await window.setAlwaysOnTop(pinned);
}

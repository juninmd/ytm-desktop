import { isDesktop } from "./auth";

/** Fullscreen for the native window on desktop, for the page in the browser preview. */
export async function setFullscreen(on: boolean): Promise<void> {
  if (isDesktop()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
    return;
  }
  if (on) await document.documentElement.requestFullscreen();
  else if (document.fullscreenElement) await document.exitFullscreen();
}

export async function isFullscreen(): Promise<boolean> {
  if (isDesktop()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().isFullscreen();
  }
  return document.fullscreenElement !== null;
}

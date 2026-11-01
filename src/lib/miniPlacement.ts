/** Physical-pixel rectangle of a monitor, as the window API reports it. */
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

const KEY = "ytm-desktop:mini-position";

/** How much of the window's top-left corner must be reachable: its title bar. */
const GRAB = 48;

/**
 * Whether a remembered position still lands on a connected monitor. A monitor
 * that was unplugged since the last use must never strand the mini window
 * off-screen, so anything not clearly visible is rejected.
 */
export function isReachable(position: Point, monitors: Rect[]): boolean {
  return monitors.some(
    (monitor) =>
      position.x + GRAB > monitor.x &&
      position.x < monitor.x + monitor.width - GRAB &&
      position.y >= monitor.y &&
      position.y < monitor.y + monitor.height - GRAB,
  );
}

/** Reads the stored position, rebuilt field by field: storage is user-writable. */
export function readPosition(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Point> | null;
    if (!value || typeof value.x !== "number" || typeof value.y !== "number") return null;
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
    return { x: Math.round(value.x), y: Math.round(value.y) };
  } catch {
    return null;
  }
}

export function loadMiniPosition(): Point | null {
  try {
    return readPosition(localStorage.getItem(KEY));
  } catch {
    return null; // storage blocked: the mini window just opens where it is
  }
}

export function saveMiniPosition(position: Point): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(position));
  } catch {
    // Remembering where the strip was is a nicety, never a failure.
  }
}

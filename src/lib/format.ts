/** `213` -> `3:33`. Hours are dropped, matching YouTube Music. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** Total runtime of a collection, e.g. `42 min`. */
export function formatRuntime(tracks: { duration: number }[]): string {
  const seconds = tracks.reduce((sum, track) => sum + track.duration, 0);
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

import { useEffect, useMemo, useState } from "react";
import { fetchLyrics, type Lyrics } from "../lib/music";
import { usePlayer } from "./usePlayer";

/** Shared by the side panel and the cinema view, so a track is fetched once. */
const cache = new Map<string, Lyrics>();
const CACHE_LIMIT = 100;

/** Index of the line being sung at `position` (the last line at or before the playhead). */
export function activeLineIndex(lyrics: Lyrics | null, position: number): number {
  if (!lyrics?.synced) return -1;
  let index = -1;
  for (let i = 0; i < lyrics.lines.length; i += 1) {
    if (lyrics.lines[i].time <= position + 0.15) index = i;
    else break;
  }
  return index;
}

/**
 * The lyrics of the playing track, plus the line being sung. Only lyrics that
 * belong to the track on screen are ever returned, so switching tracks cannot
 * flash the previous song's lines.
 */
export function useLyrics() {
  const { current, state } = usePlayer();
  const [loaded, setLoaded] = useState<{ id: string; lyrics: Lyrics } | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);

  // A stable key: the query only changes when the track changes, not on every
  // playback tick.
  const query = useMemo(
    () =>
      current
        ? {
            id: current.id,
            title: current.title,
            artist: current.artist,
            album: current.album,
            duration: current.duration,
          }
        : null,
    // The track's other fields are constant for a given id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id],
  );

  useEffect(() => {
    if (!query) {
      setLoaded(null);
      return;
    }
    const cached = cache.get(query.id);
    if (cached) {
      setLoaded({ id: query.id, lyrics: cached });
      return;
    }

    let cancelled = false;
    setFailed(null);
    void fetchLyrics(query)
      .then((result) => {
        if (cancelled) return;
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
        cache.set(query.id, result);
        setLoaded({ id: query.id, lyrics: result });
      })
      .catch((cause) => {
        if (cancelled) return;
        setFailed({
          id: query.id,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const lyrics = loaded && query && loaded.id === query.id ? loaded.lyrics : null;
  const error = failed && query && failed.id === query.id ? failed.message : null;
  const activeIndex = useMemo(() => activeLineIndex(lyrics, state.position), [lyrics, state.position]);

  return { current, lyrics, error, activeIndex };
}

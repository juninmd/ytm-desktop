import { useCallback } from "react";
import { resolveTracks } from "../data/catalog";
import { usePlayer } from "./usePlayer";

/**
 * Bridges catalogue ids to the player. Components stay unaware of how a
 * collection resolves to tracks.
 */
export function usePlayCollection() {
  const { play } = usePlayer();
  return useCallback(
    (trackIds: string[], startAt = 0) => {
      const tracks = resolveTracks(trackIds);
      if (tracks.length > 0) play(tracks, startAt);
    },
    [play],
  );
}

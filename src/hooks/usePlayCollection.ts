import { useCallback } from "react";
import { useCatalog } from "./useCatalog";
import { usePlayer } from "./usePlayer";
import type { Collection } from "../types";

/**
 * Bridges collections to the player. A card that came from a home shelf knows
 * its id but not its tracks, so this loads the collection first when needed —
 * the components stay unaware of how a collection resolves to tracks.
 */
export function usePlayCollection() {
  const { play } = usePlayer();
  const { resolveTracks, ensureCollection } = useCatalog();

  return useCallback(
    async (collection: Collection, startAt = 0) => {
      const known = resolveTracks(collection.trackIds);
      if (known.length > 0) {
        play(known, startAt);
        return;
      }

      try {
        const loaded = await ensureCollection(collection.id);
        if (loaded && loaded.tracks.length > 0) play(loaded.tracks, startAt);
      } catch {
        // The card could not be expanded (offline); leave the transport as-is
        // rather than surfacing an unhandled rejection.
      }
    },
    [play, resolveTracks, ensureCollection],
  );
}

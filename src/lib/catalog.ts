import type { Collection, Track } from "../types";
import type { CatalogPage } from "./music";

/**
 * The catalogue store's pure core: how a fetched page folds into what is already
 * known. Kept free of React so `useCatalog` stays a thin state shell and the
 * merge — the part with real edge cases — is unit-tested.
 */

export type CatalogMaps = {
  collections: Record<string, Collection>;
  tracks: Record<string, Track>;
};

export const EMPTY_MAPS: CatalogMaps = { collections: {}, tracks: {} };

/**
 * Merges `page` into `previous`. When a collection is already known with its
 * track list and the incoming card is a bare stub, the richer side wins — the
 * home shelves only ever hand over cards.
 */
export function mergeCatalog(previous: CatalogMaps, page: CatalogPage): CatalogMaps {
  const collections = { ...previous.collections };
  for (const collection of page.collections) {
    if (!collection.id) continue;
    const existing = collections[collection.id];
    collections[collection.id] =
      existing && existing.trackIds.length > 0 && collection.trackIds.length === 0
        ? existing
        : collection;
  }

  const tracks = { ...previous.tracks };
  for (const track of page.tracks) tracks[track.id] = track;

  return { collections, tracks };
}

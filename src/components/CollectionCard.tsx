import { Play } from "lucide-react";
import type { Collection } from "../data/catalog";
import { Cover } from "./Cover";
import { usePlayCollection } from "../hooks/usePlayCollection";
import { cn } from "../lib/cn";

type Props = {
  collection: Collection;
  onOpen: (collection: Collection) => void;
  className?: string;
};

/**
 * One card, two actions. The card-sized button underneath opens the collection;
 * the round button on top plays it. Kept as siblings so neither nests inside the
 * other and both stay reachable by keyboard.
 */
export function CollectionCard({ collection, onOpen, className }: Props) {
  const playCollection = usePlayCollection();

  return (
    <article
      className={cn("group relative rounded-lg p-3 transition-colors hover:bg-white/6", className)}
    >
      <div className="relative mb-3">
        <Cover seed={collection.id} title={collection.title} className="aspect-square w-full rounded-lg" />
        <button
          type="button"
          onClick={() => playCollection(collection.trackIds)}
          aria-label={`Tocar ${collection.title}`}
          className="bg-accent hover:bg-accent-strong absolute right-2 bottom-2 z-20 grid size-10 translate-y-1 place-items-center rounded-full text-white opacity-0 shadow-[0_10px_24px_rgb(0_0_0/0.6)] transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
        >
          <Play className="size-4 fill-current" />
        </button>
      </div>
      <button
        type="button"
        aria-label={`Abrir ${collection.title}`}
        onClick={() => onOpen(collection)}
        className="absolute inset-0 z-10 rounded-lg"
      />
      <p className="truncate text-sm font-medium">{collection.title}</p>
      <p className="line-clamp-2 text-xs text-muted">
        {collection.description ?? collection.subtitle}
      </p>
    </article>
  );
}

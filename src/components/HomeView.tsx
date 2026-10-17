import { useCatalog } from "../hooks/useCatalog";
import { CollectionCard } from "./CollectionCard";
import { usePlayCollection } from "../hooks/usePlayCollection";
import { heroStyle } from "../lib/cover";
import { Cover } from "./Cover";
import { Play } from "lucide-react";
import type { Collection } from "../types";

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function HomeView({ onOpen }: { onOpen: (collection: Collection) => void }) {
  const playCollection = usePlayCollection();
  const { quickPicks, shelves, getCollection, status, error } = useCatalog();

  if (status === "loading") {
    return (
      <div className="grid place-items-center px-6 py-24 text-center text-sm text-muted">
        Carregando o catálogo…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="grid place-items-center px-6 py-24 text-center">
        <p className="text-lg font-semibold">Não foi possível carregar o catálogo</p>
        <p className="mt-1 max-w-[46ch] text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative pb-8">
      {quickPicks[0] && (
        <div
          className="fade-bottom pointer-events-none absolute inset-x-0 top-0 h-72"
          style={heroStyle(quickPicks[0])}
        />
      )}
      <div className="relative px-6 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">{greeting(new Date().getHours())}</h1>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {quickPicks.slice(0, 6).map((id) => {
            const collection = getCollection(id);
            if (!collection) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => void playCollection(collection)}
                className="group flex items-center gap-4 overflow-hidden rounded-md bg-white/6 pr-4 text-left transition-colors hover:bg-white/12"
              >
                <Cover
                  seed={id}
                  title={collection.title}
                  src={collection.thumbnail}
                  className="size-[68px]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {collection.title}
                </span>
                <span className="bg-accent grid size-10 shrink-0 place-items-center rounded-full text-white opacity-0 shadow-[0_8px_20px_rgb(0_0_0/0.55)] transition group-hover:opacity-100">
                  <Play className="size-4 fill-current" />
                </span>
              </button>
            );
          })}
        </div>

        {shelves.map((shelf) => (
          <section key={shelf.title} className="mt-10">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{shelf.title}</h2>
                {shelf.subtitle && <p className="text-xs text-muted">{shelf.subtitle}</p>}
              </div>
              <button type="button" className="text-xs font-semibold text-muted hover:text-fg">
                Mostrar tudo
              </button>
            </div>

            <div className="no-scrollbar -mx-2 mt-3 flex gap-1 overflow-x-auto px-2 pb-1">
              {shelf.ids.map((id) => {
                const collection = getCollection(id);
                if (!collection) return null;
                return (
                  <CollectionCard
                    key={`${shelf.title}-${id}`}
                    collection={collection}
                    onOpen={onOpen}
                    className="w-[172px] shrink-0"
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

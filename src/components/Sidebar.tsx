import { Compass, Heart, Home, Library, LogOut, Music2, Plus, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { Logo } from "./ui/Logo";
import { cn } from "../lib/cn";
import type { Session } from "../lib/auth";
import type { View } from "../types";

type Props = {
  view: View;
  onNavigate: (view: View) => void;
  session: Session;
  onSignOut: () => void;
};

export function Sidebar({ view, onNavigate, session, onSignOut }: Props) {
  const { libraryCollections, likedId, source } = useCatalog();
  const liked = likedId ? libraryCollections.find((item) => item.id === likedId) : undefined;
  const playlists = libraryCollections.filter(
    (collection) => collection.kind === "playlist" && collection.id !== likedId,
  );
  const albums = libraryCollections.filter((collection) => collection.kind === "album");
  const nav: { label: string; icon: LucideIcon; target: View; active: boolean }[] = [
    { label: "Início", icon: Home, target: { kind: "home" }, active: view.kind === "home" },
    { label: "Explorar", icon: Compass, target: { kind: "library" }, active: false },
    { label: "Biblioteca", icon: Library, target: { kind: "library" }, active: view.kind === "library" },
  ];

  return (
    <aside className="flex w-[264px] shrink-0 flex-col gap-2">
      <nav className="rounded-panel bg-panel p-2">
        <div className="flex items-center gap-2.5 px-3 py-3">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">YouTube Music</span>
          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-subtle">
            protótipo
          </span>
        </div>

        <ul className="space-y-0.5">
          {nav.map(({ label, icon: Icon, target, active }) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => onNavigate(target)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-4 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-hover text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon className={cn("size-5", active && "text-accent")} strokeWidth={2.2} />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="rounded-panel flex min-h-0 flex-1 flex-col bg-panel">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Library className="size-4" />
            Sua biblioteca
          </h2>
          <div className="flex items-center">
            <IconButton label="Buscar na biblioteca" className="size-7">
              <Search className="size-4" />
            </IconButton>
            <IconButton label="Criar playlist" className="size-7">
              <Plus className="size-4" />
            </IconButton>
          </div>
        </header>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {liked && (
            <LibraryRow
              seed="liked-songs"
              title="Músicas curtidas"
              subtitle={`Playlist · ${liked.trackIds.length} faixas`}
              active={view.kind === "playlist" && view.id === liked.id}
              accent
              src={liked.thumbnail}
              onClick={() => onNavigate({ kind: "playlist", id: liked.id })}
            />
          )}

          {playlists.map((playlist) => (
            <LibraryRow
              key={playlist.id}
              seed={playlist.id}
              title={playlist.title}
              subtitle={`Playlist · ${playlist.trackIds.length || "?"} faixas`}
              active={view.kind === "playlist" && view.id === playlist.id}
              src={playlist.thumbnail}
              onClick={() => onNavigate({ kind: "playlist", id: playlist.id })}
            />
          ))}

          {albums.map((album) => (
            <LibraryRow
              key={album.id}
              seed={album.id}
              title={album.title}
              subtitle={album.subtitle || "Álbum"}
              active={view.kind === "album" && view.id === album.id}
              src={album.thumbnail}
              onClick={() => onNavigate({ kind: "album", id: album.id })}
            />
          ))}

          {source === "ytmusic" && libraryCollections.length === 0 && (
            <p className="px-3 py-2 text-xs text-subtle">
              Conecte o cookie em Biblioteca para ver suas playlists.
            </p>
          )}
        </div>

        <footer className="border-t border-line p-2">
          <div className="flex items-center gap-3 rounded-md p-2">
            <span className="bg-linear-to-br from-accent to-accent-strong grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">
              {session.via === "demo" ? <Music2 className="size-4" /> : session.displayName.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{session.displayName}</span>
              <span className="block truncate text-xs text-muted">{session.email}</span>
            </span>
            <IconButton label="Sair da conta" className="size-7" onClick={onSignOut}>
              <LogOut className="size-4" />
            </IconButton>
          </div>
        </footer>
      </section>
    </aside>
  );
}

function LibraryRow({
  seed,
  title,
  subtitle,
  active,
  accent = false,
  src,
  onClick,
}: {
  seed: string;
  title: string;
  subtitle: string;
  active: boolean;
  accent?: boolean;
  src?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-hover",
        active && "bg-hover",
      )}
    >
      {accent ? (
        <span className="bg-linear-to-br from-accent to-accent-strong grid size-10 shrink-0 place-items-center rounded-md">
          <Heart className="size-4 fill-white text-white" />
        </span>
      ) : (
        <Cover seed={seed} title={title} src={src} className="size-10" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
    </button>
  );
}

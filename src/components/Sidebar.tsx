import { Compass, Heart, Home, Library, LogOut, Music2, Plus, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { albums, getPlaylist, playlists } from "../data/catalog";
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
  const liked = getPlaylist("curtidas");
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
              onClick={() => onNavigate({ kind: "playlist", id: liked.id })}
            />
          )}

          {playlists
            .filter((playlist) => playlist.id !== "curtidas")
            .map((playlist) => (
              <LibraryRow
                key={playlist.id}
                seed={playlist.id}
                title={playlist.title}
                subtitle={`Playlist · ${playlist.trackIds.length} faixas`}
                active={view.kind === "playlist" && view.id === playlist.id}
                onClick={() => onNavigate({ kind: "playlist", id: playlist.id })}
              />
            ))}

          {albums.map((album) => (
            <LibraryRow
              key={album.id}
              seed={album.id}
              title={album.title}
              subtitle={`${album.kind === "album" ? "Álbum" : album.kind === "ep" ? "EP" : "Single"} · ${album.artist}`}
              active={view.kind === "album" && view.id === album.id}
              onClick={() => onNavigate({ kind: "album", id: album.id })}
            />
          ))}
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
  onClick,
}: {
  seed: string;
  title: string;
  subtitle: string;
  active: boolean;
  accent?: boolean;
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
        <Cover seed={seed} title={title} className="size-10" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
    </button>
  );
}

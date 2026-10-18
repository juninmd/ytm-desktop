import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { CollectionView } from "./components/CollectionView";
import { ArtistView } from "./components/ArtistView";
import { DownloadsView } from "./components/DownloadsView";
import { HomeView } from "./components/HomeView";
import { LibraryView } from "./components/LibraryView";
import { LyricsPanel } from "./components/LyricsPanel";
import { PlayerBar } from "./components/PlayerBar";
import { QueuePanel } from "./components/QueuePanel";
import { SearchView } from "./components/SearchView";
import { Sidebar } from "./components/Sidebar";
import { SignInScreen } from "./components/SignInScreen";
import { TopBar } from "./components/TopBar";
import { Logo } from "./components/ui/Logo";
import { CatalogProvider, useCatalog } from "./hooks/useCatalog";
import { useAuth } from "./hooks/useAuth";
import { PlayerProvider, usePlayer } from "./hooks/usePlayer";
import { fetchRadio } from "./lib/music";
import type { Collection, View } from "./types";

/** A placeholder for a collection the store has not indexed yet, keyed by id. */
function STUB_COLLECTION(
  id: string,
  kind: "album" | "playlist" | "artist",
): Collection {
  return {
    id,
    kind,
    format: kind === "album" ? "album" : kind === "artist" ? "artist" : "playlist",
    title: "",
    subtitle: "",
    trackIds: [],
  };
}

export default function App() {
  return (
    <PlayerProvider>
      <Shell />
    </PlayerProvider>
  );
}

function Shell() {
  const auth = useAuth();

  if (auth.status === "restoring") {
    return (
      <div className="grid h-full place-items-center">
        <Logo className="size-10 animate-pulse" />
        <span className="sr-only">Carregando o player</span>
      </div>
    );
  }

  if (!auth.session) return <SignInScreen auth={auth} />;

  return (
    <CatalogProvider>
      <Workspace session={auth.session} onSignOut={() => void auth.leave()} />
    </CatalogProvider>
  );
}

function Workspace({
  session,
  onSignOut,
}: {
  session: NonNullable<ReturnType<typeof useAuth>["session"]>;
  onSignOut: () => void;
}) {
  const player = usePlayer();
  const { getCollection, likedTrackIds } = useCatalog();
  const { syncLiked, notice, dismissNotice } = player;
  const [view, setView] = useState<View>({ kind: "home" });
  const [history, setHistory] = useState<View[]>([]);
  const [query, setQuery] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  // The queue and the lyrics share the same slot, so each closes the other.
  const toggleQueue = () => {
    setQueueOpen((open) => !open);
    setLyricsOpen(false);
  };
  const toggleLyrics = () => {
    setLyricsOpen((open) => !open);
    setQueueOpen(false);
  };

  const navigate = (next: View) => {
    setHistory((stack) => [...stack, view]);
    setView(next);
    setQuery("");
  };

  const openCollection = (collection: Collection) =>
    navigate(
      collection.kind === "album"
        ? { kind: "album", id: collection.id }
        : collection.kind === "artist"
          ? { kind: "artist", id: collection.id }
          : { kind: "playlist", id: collection.id },
    );

  const goBack = () => {
    const previous = history[history.length - 1];
    setHistory((stack) => stack.slice(0, -1));
    setView(previous ?? { kind: "home" });
    setQuery("");
  };

  // The transport is read through a ref so the listener binds once instead of
  // re-subscribing on every playback tick.
  const latest = useRef(player);
  useEffect(() => {
    latest.current = player;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable);
      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

      const api = latest.current;
      switch (event.key) {
        case " ":
          event.preventDefault();
          api.toggle();
          break;
        case "ArrowRight":
          api.seek(api.state.position + 5);
          break;
        case "ArrowLeft":
          api.seek(api.state.position - 5);
          break;
        case "ArrowUp":
          event.preventDefault();
          api.setVolume(Math.min(1, api.state.volume + 0.05));
          break;
        case "ArrowDown":
          event.preventDefault();
          api.setVolume(Math.max(0, api.state.volume - 0.05));
          break;
        case "n":
          api.next();
          break;
        case "p":
          api.previous();
          break;
        case "m":
          api.toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Seed the local hearts from the account's liked songs once the library loads.
  useEffect(() => {
    syncLiked(likedTrackIds);
  }, [likedTrackIds, syncLiked]);

  // When the queue runs out with autoplay on, continue with the track's radio —
  // the behaviour people expect from YouTube Music.
  useEffect(() => {
    if (!player.state.needsRadio) return;
    const seed = player.current?.id;
    if (!seed) return;
    let cancelled = false;
    void fetchRadio(seed)
      .then((tracks) => {
        if (!cancelled) player.appendRadio(tracks ?? []);
      })
      .catch(() => {
        // No radio available: clear the flag so the player just stops.
        if (!cancelled) player.appendRadio([]);
      });
    return () => {
      cancelled = true;
    };
  }, [player.state.needsRadio, player.current?.id, player.appendRadio]);

  const collection =
    view.kind === "album" || view.kind === "playlist" ? getCollection(view.id) : undefined;

  let content;
  if (query.trim().length > 0) {
    content = <SearchView query={query} onOpen={openCollection} />;
  } else if (view.kind === "library") {
    content = <LibraryView onOpen={openCollection} />;
  } else if (view.kind === "downloads") {
    content = <DownloadsView />;
  } else if (view.kind === "artist") {
    content = <ArtistView id={view.id} onOpen={openCollection} />;
  } else if (collection) {
    content = <CollectionView collection={collection} onOpen={openCollection} />;
  } else if (view.kind === "album" || view.kind === "playlist") {
    // A just-opened collection that the store has not indexed yet. The view
    // resolves it from the id itself.
    content = <CollectionView collection={STUB_COLLECTION(view.id, view.kind)} onOpen={openCollection} />;
  } else {
    content = <HomeView onOpen={openCollection} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <Sidebar view={view} onNavigate={navigate} session={session} onSignOut={onSignOut} />

        <main className="rounded-panel flex min-w-0 flex-1 flex-col overflow-hidden bg-panel">
          <TopBar
            query={query}
            onQueryChange={setQuery}
            onBack={goBack}
            queueOpen={queueOpen}
            onToggleQueue={toggleQueue}
          />
          {player.resolverAvailable === false && (
            <div className="flex items-start gap-2.5 border-b border-line bg-accent/8 px-4 py-2.5 text-xs">
              <TriangleAlert className="mt-px size-4 shrink-0 text-accent" />
              <p className="text-fg/85">
                <span className="font-medium">Áudio real indisponível:</span> o{" "}
                <code className="text-fg">yt-dlp</code> não foi encontrado, então o transporte está
                simulado (sem som). Instale-o com{" "}
                <code className="text-fg">winget install yt-dlp.yt-dlp</code> e reabra o app para
                tocar de verdade.
              </p>
            </div>
          )}
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto">{content}</div>
        </main>

        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
        {lyricsOpen && <LyricsPanel onClose={() => setLyricsOpen(false)} />}
      </div>

      <PlayerBar
        queueOpen={queueOpen}
        onToggleQueue={toggleQueue}
        lyricsOpen={lyricsOpen}
        onToggleLyrics={toggleLyrics}
      />

      <div className="sr-only" aria-live="polite">
        {player.current ? `Tocando ${player.current.title}, de ${player.current.artist}` : ""}
      </div>

      {notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[104px] z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-raised px-4 py-2 text-xs text-fg shadow-[0_10px_30px_rgb(0_0_0/0.5)]">
            <TriangleAlert className="size-3.5 shrink-0 text-accent" />
            {notice}
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Fechar aviso"
              className="text-subtle transition-colors hover:text-fg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

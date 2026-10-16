import { useEffect, useRef, useState } from "react";
import { CollectionView } from "./components/CollectionView";
import { HomeView } from "./components/HomeView";
import { LibraryView } from "./components/LibraryView";
import { PlayerBar } from "./components/PlayerBar";
import { QueuePanel } from "./components/QueuePanel";
import { SearchView } from "./components/SearchView";
import { Sidebar } from "./components/Sidebar";
import { SignInScreen } from "./components/SignInScreen";
import { TopBar } from "./components/TopBar";
import { Logo } from "./components/ui/Logo";
import { getCollection, type Collection } from "./data/catalog";
import { useAuth } from "./hooks/useAuth";
import { PlayerProvider, usePlayer } from "./hooks/usePlayer";
import type { View } from "./types";

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

  return <Workspace session={auth.session} onSignOut={() => void auth.leave()} />;
}

function Workspace({
  session,
  onSignOut,
}: {
  session: NonNullable<ReturnType<typeof useAuth>["session"]>;
  onSignOut: () => void;
}) {
  const player = usePlayer();
  const [view, setView] = useState<View>({ kind: "home" });
  const [history, setHistory] = useState<View[]>([]);
  const [query, setQuery] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);

  const navigate = (next: View) => {
    setHistory((stack) => [...stack, view]);
    setView(next);
    setQuery("");
  };

  const openCollection = (collection: Collection) =>
    navigate(
      collection.kind === "album"
        ? { kind: "album", id: collection.id }
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

  const collection =
    view.kind === "album" || view.kind === "playlist" ? getCollection(view.id) : undefined;

  let content;
  if (query.trim().length > 0) {
    content = <SearchView query={query} onOpen={openCollection} />;
  } else if (view.kind === "library") {
    content = <LibraryView onOpen={openCollection} />;
  } else if (collection) {
    content = <CollectionView collection={collection} />;
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
            onToggleQueue={() => setQueueOpen((open) => !open)}
          />
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto">{content}</div>
        </main>

        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>

      <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((open) => !open)} />

      <div className="sr-only" aria-live="polite">
        {player.current ? `Tocando ${player.current.title}, de ${player.current.artist}` : ""}
      </div>
    </div>
  );
}

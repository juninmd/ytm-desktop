import { useEffect, useRef } from "react";
import { usePlayer } from "./usePlayer";
import { nextRate } from "./playerReducer";
import { resolveShortcut, type Command, type Target } from "../lib/shortcuts";
import { useI18n } from "../lib/i18n";

type Handlers = {
  toggleQueue: () => void;
  toggleLyrics: () => void;
  toggleHelp: () => void;
  toggleMini: () => void;
  toggleCinema: () => void;
};

function targetOf(element: EventTarget | null): Target {
  if (!(element instanceof HTMLElement)) return { tag: "BODY" };
  return {
    tag: element.tagName,
    type: element instanceof HTMLInputElement ? element.type : undefined,
    editable: element.isContentEditable,
  };
}

/** Binds the global keyboard map once; the player is read through a ref, not re-subscribed. */
export function useShortcuts({ toggleQueue, toggleLyrics, toggleHelp, toggleMini, toggleCinema }: Handlers) {
  const player = usePlayer();
  const { t } = useI18n();
  const latest = useRef({ player, t, toggleQueue, toggleLyrics, toggleHelp, toggleMini, toggleCinema });
  latest.current = { player, t, toggleQueue, toggleLyrics, toggleHelp, toggleMini, toggleCinema };

  useEffect(() => {
    const run = (command: Command) => {
      const { player: api, t: translate } = latest.current;
      switch (command) {
        case "toggle":
          api.toggle();
          break;
        case "seek-back":
          api.seek(api.state.position - 5);
          break;
        case "seek-forward":
          api.seek(api.state.position + 5);
          break;
        case "next":
          api.next();
          break;
        case "previous":
          api.previous();
          break;
        case "volume-up":
          api.setVolume(Math.min(1, api.state.volume + 0.05));
          break;
        case "volume-down":
          api.setVolume(Math.max(0, api.state.volume - 0.05));
          break;
        case "mute":
          api.toggleMute();
          break;
        case "like":
          if (api.current) api.toggleLike(api.current.id);
          break;
        case "shuffle":
          api.toggleShuffle();
          break;
        case "repeat":
          api.cycleRepeat();
          break;
        case "speed-down":
        case "speed-up": {
          const rate = nextRate(api.state.rate, command === "speed-up" ? 1 : -1);
          api.setRate(rate);
          api.notify(translate("speed.changed", { rate }), "info");
          break;
        }
        case "queue":
          latest.current.toggleQueue();
          break;
        case "lyrics":
          latest.current.toggleLyrics();
          break;
        case "search":
          document.getElementById("global-search")?.focus();
          break;
        case "cinema":
          latest.current.toggleCinema();
          break;
        case "mini":
          latest.current.toggleMini();
          break;
        case "help":
          latest.current.toggleHelp();
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // A modal dialog or an open menu owns the keyboard until it closes.
      if (document.querySelector('[aria-modal="true"], [role="menu"]')) return;
      const command = resolveShortcut(event, targetOf(event.target));
      if (!command) return;
      event.preventDefault();
      run(command);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

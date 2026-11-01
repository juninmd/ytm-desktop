import { useEffect, useState } from "react";
import { Moon, TimerOff } from "lucide-react";
import { anchorFromElement } from "./ui/Menu";
import { useMenu } from "./ui/useMenu";
import { usePlayer } from "../hooks/usePlayer";
import { RATES } from "../hooks/playerReducer";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";
import { formatRemaining, remainingMs, SLEEP_MINUTES } from "../lib/sleepTimer";

/** `Date.now()` that refreshes once a second while `active`, for a live countdown. */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Playback speed and sleep timer: the two menus that live next to the volume. */
export function PlaybackOptions() {
  const { state, setRate, sleep, startSleep, sleepAtEndOfTrack, cancelSleep } = usePlayer();
  const { t } = useI18n();
  const menu = useMenu();
  const now = useClock(sleep?.kind === "minutes");

  const left = sleep ? remainingMs(sleep, now) : null;
  const rateLabel = `${state.rate}×`;

  return (
    <>
      {menu.node}
      <button
        type="button"
        aria-label={t("speed.button", { rate: state.rate })}
        title={t("speed.button", { rate: state.rate })}
        aria-haspopup="menu"
        onClick={(event) =>
          menu.toggle(
            t("speed.title"),
            [
              { id: "heading", heading: t("speed.title") },
              ...RATES.map((rate) => ({
                id: `rate-${rate}`,
                label: rate === 1 ? t("speed.normal") : `${rate}×`,
                checked: rate === state.rate,
                onSelect: () => setRate(rate),
              })),
            ],
            anchorFromElement(event.currentTarget, "up", "end"),
          )
        }
        className={cn(
          "h-8 min-w-8 shrink-0 rounded-full px-2 text-xs font-medium tabular-nums transition-colors",
          "hover:bg-white/8 hover:text-fg",
          state.rate === 1 ? "text-muted" : "text-accent hover:text-accent",
        )}
      >
        {rateLabel}
      </button>

      <button
        type="button"
        aria-label={t("sleep.button")}
        title={
          sleep?.kind === "track"
            ? t("sleep.armedTrack")
            : left !== null
              ? t("sleep.armedMinutes", { time: formatRemaining(left) })
              : t("sleep.button")
        }
        aria-haspopup="menu"
        aria-pressed={sleep !== null}
        onClick={(event) =>
          menu.toggle(
            t("sleep.title"),
            [
              { id: "heading", heading: t("sleep.title") },
              ...SLEEP_MINUTES.map((minutes) => ({
                id: `sleep-${minutes}`,
                label: t("sleep.minutes", { count: minutes }),
                checked: sleep?.kind === "minutes" && sleep.minutes === minutes,
                onSelect: () => startSleep(minutes),
              })),
              {
                id: "sleep-track",
                label: t("sleep.endOfTrack"),
                checked: sleep?.kind === "track",
                onSelect: sleepAtEndOfTrack,
              },
              ...(sleep
                ? [
                    { id: "divider", separator: true } as const,
                    {
                      id: "sleep-off",
                      label: t("sleep.off"),
                      icon: <TimerOff className="size-4" />,
                      onSelect: cancelSleep,
                    },
                  ]
                : []),
            ],
            anchorFromElement(event.currentTarget, "up", "end"),
          )
        }
        className={cn(
          "flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium tabular-nums transition-colors",
          "hover:bg-white/8 hover:text-fg",
          sleep ? "text-accent hover:text-accent" : "text-muted",
        )}
      >
        <Moon className={cn("size-4", sleep && "fill-accent/30")} />
        {left !== null && <span>{formatRemaining(left)}</span>}
      </button>
    </>
  );
}

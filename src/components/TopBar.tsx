import { ChevronLeft, ChevronRight, Keyboard, ListMusic, PictureInPicture2, Search, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  onOpenShortcuts: () => void;
  onOpenMini: () => void;
};

export function TopBar({ query, onQueryChange, onBack, queueOpen, onToggleQueue, onOpenShortcuts, onOpenMini }: Props) {
  const { t } = useI18n();
  return (
    <header className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1">
        <IconButton label={t("top.back")} onClick={onBack}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <IconButton label={t("top.forward")} disabled>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      <div
        className={cn(
          "relative w-full max-w-[420px] transition-[width] duration-200",
          // Narrow windows: a round search button that opens on focus, and stays open with a query.
          "max-[1100px]:w-10 max-[1100px]:focus-within:w-72",
          query && "max-[1100px]:w-72",
        )}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("top.placeholder")}
          aria-label={t("top.search")}
          className={cn(
            "h-10 w-full min-w-0 rounded-full border border-transparent bg-raised pl-10 text-sm",
            // Collapsed, the right padding goes too, or the input stays wider than its button.
            query ? "pr-10" : "pr-10 max-[1100px]:pr-0 max-[1100px]:focus:pr-10",
            "placeholder:text-subtle hover:border-line-strong focus-visible:border-line-strong focus-visible:outline-none",
            "max-[1100px]:placeholder:text-transparent max-[1100px]:focus:placeholder:text-subtle",
          )}
        />
        {query && (
          <IconButton
            label={t("top.clearSearch")}
            className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
            onClick={() => onQueryChange("")}
          >
            <X className="size-4" />
          </IconButton>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-muted xl:flex">
          {t("top.demo")}
        </span>
        <IconButton label={t("mini.enter")} hint="Ctrl Shift M" className="size-9 bg-raised" onClick={onOpenMini}>
          <PictureInPicture2 className="size-4" />
        </IconButton>
        <IconButton
          label={t("keys.open")}
          hint="?"
          className="size-9 bg-raised"
          onClick={onOpenShortcuts}
        >
          <Keyboard className="size-4" />
        </IconButton>
        <IconButton
          label={queueOpen ? t("top.hideQueue") : t("top.showQueue")}
          hint="Q"
          active={queueOpen}
          className="size-9 bg-raised"
          onClick={onToggleQueue}
        >
          <ListMusic className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}

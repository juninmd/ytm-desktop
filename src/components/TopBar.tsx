import { ChevronLeft, ChevronRight, Keyboard, ListMusic, PictureInPicture2 } from "lucide-react";
import { Badge, SearchField } from "@juninmd/sonido";
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
          // Narrow windows: the field collapses to its icon, and opens on focus
          // or while it holds a query (see `.app-search` in index.css).
          "max-[1100px]:w-10 max-[1100px]:focus-within:w-72",
          query && "max-[1100px]:w-72",
        )}
      >
        <SearchField
          // The `/` shortcut focuses this id; SearchField forwards it to the input.
          id="global-search"
          value={query}
          onChange={onQueryChange}
          label={t("top.search")}
          aria-label={t("top.search")}
          placeholder={t("top.placeholder")}
          shortcutHint
          clearLabel={t("top.clearSearch")}
          className="app-search"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden xl:flex">
          <Badge tone="neutral">{t("top.demo")}</Badge>
        </span>
        <IconButton label={t("mini.enter")} hint="Ctrl Shift M" className="app-icon-lg app-icon-surface" onClick={onOpenMini}>
          <PictureInPicture2 className="size-4" />
        </IconButton>
        <IconButton
          label={t("keys.open")}
          hint="?"
          className="app-icon-lg app-icon-surface"
          onClick={onOpenShortcuts}
        >
          <Keyboard className="size-4" />
        </IconButton>
        <IconButton
          label={queueOpen ? t("top.hideQueue") : t("top.showQueue")}
          hint="Q"
          active={queueOpen}
          className="app-icon-lg app-icon-surface"
          onClick={onToggleQueue}
        >
          <ListMusic className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}

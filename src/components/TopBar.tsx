import { ChevronLeft, ChevronRight, ListMusic, Search, X } from "lucide-react";
import { IconButton } from "./ui/IconButton";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
};

export function TopBar({ query, onQueryChange, onBack, queueOpen, onToggleQueue }: Props) {
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

      <div className="relative w-full max-w-[420px]">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("top.placeholder")}
          aria-label={t("top.search")}
          className={cn(
            "h-10 w-full rounded-full border border-transparent bg-raised pr-10 pl-10 text-sm",
            "placeholder:text-subtle hover:border-line-strong focus-visible:border-line-strong focus-visible:outline-none",
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
        <IconButton
          label={queueOpen ? t("top.hideQueue") : t("top.showQueue")}
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

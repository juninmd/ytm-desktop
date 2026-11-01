import { ArrowDown, ArrowUp, CircleArrowDown, Disc3, Ellipsis, GripVertical, Heart, Info, ListX, Play, Trash2, UserRound, X } from "lucide-react";
import { Cover } from "./Cover";
import { IconButton } from "./ui/IconButton";
import { anchorFromElement, anchorFromEvent, type MenuAnchor } from "./ui/Menu";
import { useMenu } from "./ui/useMenu";
import { useCatalog } from "../hooks/useCatalog";
import { useDragReorder } from "../hooks/useDragReorder";
import { useNavigation } from "../hooks/useNavigation";
import { usePlayer } from "../hooks/usePlayer";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/cn";
import type { Track } from "../types";

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const {
    state,
    current,
    upNext,
    isLiked,
    toggleLike,
    jump,
    dequeue,
    moveQueued,
    clearUpcoming,
    toggleAutoplay,
  } = usePlayer();
  const { t } = useI18n();
  const menu = useMenu();
  const navigation = useNavigation();
  const { isDownloaded } = useCatalog();
  const reorder = useDragReorder(
    (from, to) => moveQueued(state.cursor + 1 + from, state.cursor + 1 + to),
  );

  // Upcoming entries are addressed by their position in play order.
  const positionOf = (index: number) => state.cursor + 1 + index;

  const openMenu = (track: Track, index: number | null, anchor: MenuAnchor, owner = false) => {
    const liked = isLiked(track.id);
    const position = index === null ? state.cursor : positionOf(index);
    const last = index !== null && index === upNext.length - 1;
    (owner ? menu.toggle : menu.show)(
      t("queue.more", { title: track.title }),
      [
        { id: "play", label: t("menu.playNow"), icon: <Play className="size-4" />, onSelect: () => jump(position) },
        ...(navigation && track.albumId
          ? [{ id: "album", label: t("menu.goAlbum"), icon: <Disc3 className="size-4" />, onSelect: () => navigation.openAlbum(track.albumId) }]
          : []),
        ...(navigation && track.artist
          ? [{ id: "artist", label: t("menu.goArtist"), icon: <UserRound className="size-4" />, onSelect: () => navigation.searchFor(track.artist) }]
          : []),
        {
          id: "like",
          label: liked ? t("player.unlike") : t("player.like"),
          icon: <Heart className={cn("size-4", liked && "fill-accent text-accent")} />,
          // `L` acts on the playing track, so only that row advertises it.
          hint: index === null ? "L" : undefined,
          onSelect: () => toggleLike(track.id),
        },
        {
          id: "details",
          label: t("menu.details"),
          icon: <Info className="size-4" />,
          disabled: !navigation,
          onSelect: () => navigation?.showInfo(track),
        },
        ...(index === null
          ? []
          : [
              { id: "divider", separator: true } as const,
              {
                id: "up",
                label: t("menu.moveUp"),
                icon: <ArrowUp className="size-4" />,
                disabled: index === 0,
                onSelect: () => moveQueued(position, position - 1),
              },
              {
                id: "down",
                label: t("menu.moveDown"),
                icon: <ArrowDown className="size-4" />,
                disabled: last,
                onSelect: () => moveQueued(position, position + 1),
              },
              {
                id: "remove",
                label: t("menu.remove"),
                icon: <Trash2 className="size-4" />,
                onSelect: () => dequeue(position),
              },
            ]),
      ],
      anchor,
    );
  };

  return (
    <aside className="rounded-panel flex w-[340px] shrink-0 flex-col bg-panel">
      {menu.node}
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">{t("queue.title")}</h2>
        <IconButton label={t("queue.close")} className="size-7" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>

      <div className="px-4 pb-2">
        <button
          type="button"
          onClick={toggleAutoplay}
          aria-pressed={state.autoplay}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
            state.autoplay
              ? "border-accent/40 bg-accent/8 text-fg"
              : "border-line text-muted hover:text-fg",
          )}
        >
          <span className="font-medium">{t("queue.autoplay")}</span>
          <span className="mt-0.5 block text-[11px] text-subtle">
            {state.autoplay
              ? t("queue.autoplayOn")
              : t("queue.autoplayOff")}
          </span>
        </button>
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 py-2 text-xs font-semibold tracking-wide text-subtle uppercase">
          {t("queue.now")}
        </p>
        {current ? (
          <QueueRow
            track={current}
            playing
            liked={isLiked(current.id)}
            offline={isDownloaded(current.id)}
            onLike={toggleLike}
            onJump={() => jump(state.cursor)}
            onMenu={(anchor, owner) => openMenu(current, null, anchor, owner)}
          />
        ) : (
          <p className="px-2 py-2 text-sm text-muted">{t("queue.empty")}</p>
        )}

        <div className="flex items-center justify-between px-2 pt-5 pb-2">
          <p className="text-xs font-semibold tracking-wide text-subtle uppercase">
            {t("queue.next")} {upNext.length > 0 && `· ${upNext.length}`}
          </p>
          {upNext.length > 0 && (
            <button
              type="button"
              onClick={clearUpcoming}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-fg"
            >
              <ListX className="size-3.5" />
              {t("queue.clear")}
            </button>
          )}
        </div>
        {upNext.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted">
            {t("queue.nothingNext")}
          </p>
        ) : (
          <div ref={(node) => { reorder.container.current = node; }}>
            {upNext.map((track, index) => (
              <QueueRow
                key={`${track.id}-${index}`}
                track={track}
                liked={isLiked(track.id)}
                offline={isDownloaded(track.id)}
                onLike={toggleLike}
                onJump={() => jump(positionOf(index))}
                onMenu={(anchor, owner) => openMenu(track, index, anchor, owner)}
                onGrab={reorder.start(index)}
                dragState={
                  reorder.drag === null
                    ? undefined
                    : index === reorder.drag.from
                      ? "source"
                      : index === reorder.drag.over
                        ? reorder.drag.over > reorder.drag.from ? "below" : "above"
                        : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function QueueRow({
  track,
  playing = false,
  liked,
  offline = false,
  onLike,
  onJump,
  onMenu,
  onGrab,
  dragState,
}: {
  track: Track;
  playing?: boolean;
  liked: boolean;
  offline?: boolean;
  onLike: (id: string) => void;
  onJump: () => void;
  onMenu: (anchor: MenuAnchor, owner?: boolean) => void;
  /** Present on upcoming rows only: starts a pointer drag to reorder. */
  onGrab?: (event: React.PointerEvent) => void;
  dragState?: "source" | "above" | "below";
}) {
  const { t } = useI18n();
  return (
    <div
      data-reorder-row={onGrab ? "" : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(anchorFromEvent(event));
      }}
      className={cn(
        "group relative flex items-center gap-2 rounded-md p-2 transition-colors hover:bg-hover",
        playing && "bg-white/6",
        dragState === "source" && "opacity-40",
        dragState === "above" && "shadow-[inset_0_2px_0_var(--color-accent)]",
        dragState === "below" && "shadow-[inset_0_-2px_0_var(--color-accent)]",
      )}
    >
      {onGrab ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={t("queue.drag", { title: track.title })}
          title={t("queue.drag", { title: track.title })}
          onPointerDown={onGrab}
          className="-ml-1 grid h-8 w-4 shrink-0 cursor-grab touch-none place-items-center text-subtle opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="-ml-1 w-4 shrink-0" />
      )}
      <button
        type="button"
        onClick={onJump}
        aria-label={t("track.play", { title: track.title })}
        className="relative shrink-0"
      >
        <Cover
          seed={track.albumId || track.album}
          title={track.album}
          src={track.thumbnail}
          className="size-10"
        />
        <span className="absolute inset-0 grid place-items-center rounded-md bg-black/60 opacity-0 transition group-hover:opacity-100">
          <Play className="size-4 fill-white text-white" />
        </span>
      </button>
      <button type="button" onClick={onJump} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-sm", playing ? "text-accent" : "font-medium")}>
          {track.title}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {offline && (
            <CircleArrowDown
              className="size-3 shrink-0 fill-accent/20 text-accent"
              aria-label={t("track.offlineBadge")}
            />
          )}
          <span className="truncate">{track.artist}</span>
        </span>
      </button>
      <IconButton
        label={liked ? t("player.unlike") : t("player.like")}
        className={cn("size-7", liked && "text-accent hover:text-accent")}
        onClick={() => onLike(track.id)}
      >
        <Heart className={cn("size-4", liked && "fill-accent")} />
      </IconButton>
      <IconButton
        label={t("queue.more", { title: track.title })}
        aria-haspopup="menu"
        className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={(event) => onMenu(anchorFromElement(event.currentTarget, "down", "end"), true)}
      >
        <Ellipsis className="size-4" />
      </IconButton>
    </div>
  );
}

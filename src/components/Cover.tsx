import { coverStyle, initials } from "../lib/cover";
import { cn } from "../lib/cn";

type Props = {
  seed: string;
  title: string;
  className?: string;
  round?: boolean;
  /** Hides the monogram, e.g. behind a play-button overlay. */
  quiet?: boolean;
  /** Real artwork from the catalogue. Falls back to the generated sleeve. */
  src?: string;
};

/**
 * Sleeve art. Real artwork when the catalogue provides a url; otherwise a
 * deterministic gradient derived from `seed`, so a collection always keeps the
 * same identity without shipping image assets.
 */
export function Cover({ seed, title, className, round = false, quiet = false, src }: Props) {
  return (
    <div
      className={cn(
        "@container art-texture relative shrink-0 overflow-hidden",
        round ? "rounded-full" : "rounded-md",
        className,
      )}
      style={src ? undefined : coverStyle(seed)}
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        !quiet && (
          <span
            className="absolute inset-0 grid select-none place-items-center font-semibold tracking-tight text-white/45"
            style={{ fontSize: "30cqi" }}
          >
            {initials(title)}
          </span>
        )
      )}
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)]" />
    </div>
  );
}

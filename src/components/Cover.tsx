import { Artwork } from "@juninmd/sonido";
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
 * Sleeve art.
 *
 * A catalogue thumbnail is rendered by Sonido's `Artwork` (fade-in, image error
 * fallback, initials placeholder). Without one, the deterministic gradient
 * derived from `seed` is kept: the prototype ships no image assets, so mock
 * mode still gets a stable, distinct sleeve per collection.
 */
export function Cover({ seed, title, className, round = false, quiet = false, src }: Props) {
  if (src) {
    return (
      <Artwork
        title={title}
        src={src}
        ratio="square"
        referrerPolicy="no-referrer"
        className={cn("app-cover", round && "app-cover--round", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "@container art-texture relative shrink-0 overflow-hidden",
        round ? "rounded-full" : "rounded-md",
        className,
      )}
      style={coverStyle(seed)}
      aria-hidden="true"
    >
      {!quiet && (
        <span
          className="absolute inset-0 grid select-none place-items-center font-semibold tracking-tight text-white/45"
          style={{ fontSize: "30cqi" }}
        >
          {initials(title)}
        </span>
      )}
      <span className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)]" />
    </div>
  );
}

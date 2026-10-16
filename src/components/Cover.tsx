import { coverStyle, initials } from "../lib/cover";
import { cn } from "../lib/cn";

type Props = {
  seed: string;
  title: string;
  className?: string;
  round?: boolean;
  /** Hides the monogram, e.g. behind a play-button overlay. */
  quiet?: boolean;
};

/**
 * Generated sleeve art. Deterministic per `seed`, so a collection always keeps
 * the same identity across launches without shipping image assets.
 */
export function Cover({ seed, title, className, round = false, quiet = false }: Props) {
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

import { cn } from "../../lib/cn";

/** The brand mark: a play glyph inside a record, in the accent colour. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 text-accent", className)} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#07070a" strokeWidth="2.2" />
      <path d="M13.2 12.4v7.2l6.1-3.6z" fill="#07070a" />
    </svg>
  );
}

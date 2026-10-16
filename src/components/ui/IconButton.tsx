import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: every icon-only control needs an accessible name. */
  label: string;
  active?: boolean;
  children: ReactNode;
};

export function IconButton({ label, active, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors",
        "hover:bg-white/8 hover:text-fg disabled:pointer-events-none disabled:opacity-35",
        active && "text-accent hover:text-accent",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

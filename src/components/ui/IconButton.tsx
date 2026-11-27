import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@juninmd/sonido";
import { cn } from "../../lib/cn";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required: every icon-only control needs an accessible name. */
  label: string;
  active?: boolean;
  /** The keyboard shortcut, shown in the tooltip (the accessible name stays clean). */
  hint?: string;
  children: ReactNode;
};

/**
 * Icon-only control: Sonido's `Button` with `size="icon"`, so the hover ring,
 * pressed state and disabled styling come from the design system. Only the
 * density (32px) and the "active" accent stay local.
 */
export function IconButton({ label, active, hint, className, children, ...rest }: Props) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={hint ? `${label} (${hint})` : label}
      aria-pressed={active}
      className={cn("app-icon", active && "app-icon--active", className)}
      {...rest}
    >
      {children}
    </Button>
  );
}

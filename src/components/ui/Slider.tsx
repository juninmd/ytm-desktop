import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";

type Props = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  /** `filled` paints the elapsed portion; `plain` is a bare rail. */
  filled?: boolean;
  className?: string;
  disabled?: boolean;
};

export function Slider({ value, max, onChange, label, filled = true, className, disabled }: Props) {
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  const track = filled
    ? `linear-gradient(to right, #ffffff ${percent}%, #3a3a46 ${percent}%)`
    : "#3a3a46";

  return (
    <input
      type="range"
      className={cn("slider", className)}
      style={{ "--track": track } as CSSProperties}
      aria-label={label}
      aria-valuetext={`${Math.round(percent)}%`}
      min={0}
      max={max}
      step={max / 1000}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

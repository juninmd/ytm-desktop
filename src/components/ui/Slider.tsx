import { Slider as SonidoSlider } from "@juninmd/sonido";
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
  /** What screen readers announce; defaults to the percentage (fits volume, not time). */
  valueText?: string;
};

/**
 * The app's seek/volume rail, rendered by Sonido's `Slider`.
 *
 * The design system pairs the rail with its own label/value row; the player bar
 * already draws the elapsed and total times, so `app-slider` hides that row and
 * keeps the rail itself (see index.css).
 */
export function Slider({ value, max, onChange, label, filled = true, className, disabled, valueText }: Props) {
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <SonidoSlider
      label={label}
      value={value}
      min={0}
      max={max}
      step={max > 0 ? max / 1000 : 1}
      onChange={onChange}
      disabled={disabled}
      format={() => valueText ?? `${Math.round(percent)}%`}
      className={cn("app-slider", !filled && "app-slider--plain", className)}
    />
  );
}

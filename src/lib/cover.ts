import type { CSSProperties } from "react";

/**
 * Artwork is generated, not fetched: a deterministic gradient derived from the
 * entity id. Keeps the prototype offline-safe and makes every collection
 * visually distinct without shipping binary assets.
 */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Palette = {
  /** Accent used for the hero gradient behind a collection header. */
  base: string;
  hues: [number, number, number];
};

export function palette(seed: string): Palette {
  const h = hash(seed) % 360;
  const spread = 24 + (hash(seed + "s") % 46);
  const hues: [number, number, number] = [h, (h + spread) % 360, (h + 360 - spread) % 360];
  return { base: `hsl(${h} 68% 46%)`, hues };
}

/** Background layers for a square cover. */
export function coverStyle(seed: string): CSSProperties {
  const { hues } = palette(seed);
  const [a, b, c] = hues;
  return {
    backgroundImage: [
      `radial-gradient(115% 115% at 18% 16%, hsl(${a} 74% 52% / 0.95) 0%, transparent 58%)`,
      `radial-gradient(105% 105% at 84% 10%, hsl(${b} 80% 44% / 0.9) 0%, transparent 62%)`,
      `radial-gradient(120% 120% at 70% 96%, hsl(${c} 62% 30% / 0.95) 0%, transparent 60%)`,
      `linear-gradient(158deg, hsl(${a} 40% 16%) 0%, #08080b 100%)`,
    ].join(","),
  };
}

/** Wider, calmer version of the same gradient for a collection header. */
export function heroStyle(seed: string): CSSProperties {
  const { hues } = palette(seed);
  const [a, b] = hues;
  return {
    backgroundImage: [
      `radial-gradient(90% 160% at 6% 0%, hsl(${a} 62% 34% / 0.75) 0%, transparent 62%)`,
      `radial-gradient(80% 150% at 62% 0%, hsl(${b} 58% 24% / 0.55) 0%, transparent 66%)`,
    ].join(","),
  };
}

/** `Midnight Autobahn` -> `MA`. */
export function initials(title: string): string {
  const words = title.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

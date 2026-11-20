type MatchMedia = (query: string) => { matches: boolean };

/**
 * Scroll behaviour for programmatic scrolls. The CSS reduced-motion rule cannot
 * reach `scrollIntoView({ behavior: "smooth" })`, so the lyrics auto-scroll asks here.
 */
export function scrollBehavior(
  matchMedia: MatchMedia | undefined = typeof window === "undefined" ? undefined : window.matchMedia?.bind(window),
): ScrollBehavior {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Tiny class-name joiner. Enough for this app; no dependency worth adding. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

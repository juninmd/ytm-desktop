/**
 * Last-request-wins guard for async loads: take a ticket before awaiting, and apply the result only
 * while it is still the newest. `invalidate` drops every pending ticket (e.g. on sign-out).
 */
export function createLatest() {
  let current = 0;
  return {
    next: () => ++current,
    invalidate: () => {
      current += 1;
    },
    isCurrent: (ticket: number) => ticket === current,
  };
}

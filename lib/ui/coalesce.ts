/**
 * lib/ui/coalesce.ts
 *
 * Collapses a burst of triggers into a single trailing call.
 *
 * Motivation: one queue action writes several rows — advancing the queue
 * updates the outgoing entry, the incoming entry and both appointments, while
 * skipping renumbers every entry behind the skipped one. Postgres logical
 * replication emits one event per row, so a subscriber that refetches per
 * event does 2 full refetches for an advance and K+1 for a skip, on every
 * connected client, from a single button press.
 *
 * The rows of one action land within a few milliseconds of each other, so a
 * short trailing delay absorbs the whole burst and refetches once.
 *
 * Extracted from the hook that uses it so it can be unit-tested without a DOM.
 */

export type Coalescer = {
  /** Request a run. Repeated calls within `waitMs` collapse into one. */
  schedule: () => void;
  /** Drop any pending run — call on unmount. */
  cancel: () => void;
  /** True while a run is pending. Exposed for tests and diagnostics. */
  isPending: () => boolean;
};

export function createCoalescer(run: () => void, waitMs: number): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        run();
      }, waitMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isPending() {
      return timer !== null;
    },
  };
}

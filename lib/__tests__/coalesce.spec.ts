import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createCoalescer } from "@/lib/ui/coalesce";

/**
 * Regression cover for the queue realtime storm.
 *
 * `advanceQueue` writes 4 rows that are published to Realtime and `skipPatient`
 * writes K+1 when it renumbers a queue of K waiting patients. Replication emits
 * one event per row, and useQueue previously refetched the whole queue on each
 * one — so a single button press cost 2 full refetches per connected client on
 * an advance, and K+1 on a skip. These assert the burst collapses to one call.
 */
describe("createCoalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses an advanceQueue burst (4 published row events) into one call", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 200);

    // Four row events landing within a few ms of each other.
    c.schedule();
    vi.advanceTimersByTime(2);
    c.schedule();
    vi.advanceTimersByTime(3);
    c.schedule();
    vi.advanceTimersByTime(1);
    c.schedule();

    expect(run).not.toHaveBeenCalled(); // nothing fires mid-burst
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("collapses a skipPatient burst that renumbers a queue of 10", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 200);

    // K shifted rows + the skipped row itself.
    for (let i = 0; i < 11; i++) {
      c.schedule();
      vi.advanceTimersByTime(1);
    }

    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("still runs once per burst when bursts are separated", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 200);

    c.schedule();
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(1);

    c.schedule();
    vi.advanceTimersByTime(200);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("cancel() drops a pending run so unmount cannot refetch", () => {
    const run = vi.fn();
    const c = createCoalescer(run, 200);

    c.schedule();
    expect(c.isPending()).toBe(true);
    c.cancel();
    expect(c.isPending()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });
});

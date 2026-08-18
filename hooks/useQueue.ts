"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useBrowserSupabaseClient } from "@/lib/supabase/client";
import { getTodayQueue } from "@/actions/queue";
import { createCoalescer } from "@/lib/ui/coalesce";
import type { QueueEntryWithPatient } from "@/types";

/**
 * How long to wait for a burst of queue_entries events to finish before
 * refetching. One queue action writes several rows, and replication emits an
 * event per row; they land within a few milliseconds of each other. Long
 * enough to absorb the burst, short enough to stay imperceptible.
 */
const COALESCE_MS = 200;

interface UseQueueOptions {
  clinicId: string;
  initialQueue?: QueueEntryWithPatient[];
}

interface UseQueueReturn {
  queue: QueueEntryWithPatient[];
  isLoading: boolean;
  error: string | null;
  /**
   * Increments every time a queue change is observed. Portal patients cannot
   * see other patients' rows under RLS, so their `queue` array does NOT change
   * when the queue ahead of them moves — this token does, and is what they can
   * depend on to re-read derived values like position and estimated wait.
   */
  changeToken: number;
}

/**
 * useQueue
 *
 * Supabase Realtime subscription for the queue_entries table.
 *
 * - Accepts initialQueue from the Server Component (avoids loading flash).
 * - On any Realtime INSERT/UPDATE/DELETE event, re-fetches the full queue
 *   via getTodayQueue() Server Action so patient names and durations are fresh.
 * - Events are COALESCED (see COALESCE_MS). A single queue action writes several
 *   rows — advancing writes the outgoing entry, the incoming entry and both
 *   appointments; skipping renumbers every entry behind the skipped one — and
 *   logical replication emits one event per row. Refetching per event meant one
 *   button press triggered 2 full refetches on advance and K+1 on skip, on
 *   every connected client. Collapsing the burst into one trailing refetch
 *   makes that 1, regardless of how many rows moved.
 * - Responses are sequence-guarded: two refetches in flight could previously
 *   resolve out of order and leave the STALER one rendered.
 * - Supabase Realtime respects RLS:
 *     Staff → receive all clinic entries.
 *     Patients → receive only their own entry.
 * - Cleans up the channel subscription on unmount.
 */
export function useQueue({
  clinicId,
  initialQueue = [],
}: UseQueueOptions): UseQueueReturn {
  const supabase = useBrowserSupabaseClient();
  const [queue, setQueue] = useState<QueueEntryWithPatient[]>(initialQueue);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeToken, setChangeToken] = useState(0);

  // Keep queue in sync when the server re-renders with fresh initialQueue data
  // — the Server Action response re-renders the page after check-in, advance
  // and skip, since those actions call revalidatePath.
  useEffect(() => {
    setQueue(initialQueue);
  // We deliberately use a serialized key comparison to avoid infinite loops.
  // Supabase Realtime will handle fine-grained live updates independently.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQueue.map((e) => `${e.id}:${e.status}:${e.position}`).join(",")]);

  // Monotonic id of the most recently STARTED refetch. A response whose id is
  // no longer current has been superseded and must not be applied.
  const seqRef = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++seqRef.current;
    setIsLoading(true);
    try {
      const result = await getTodayQueue();
      if (seq !== seqRef.current) return; // a newer refetch already started
      if (result.error) {
        setError(result.error);
      } else {
        setQueue(result.data ?? []);
        setError(null);
        setChangeToken((t) => t + 1);
      }
    } catch {
      if (seq === seqRef.current) setError("Failed to refresh queue.");
    } finally {
      if (seq === seqRef.current) setIsLoading(false);
    }
  }, []);

  // Coalesce a burst of row events into a single trailing refetch.
  // See lib/ui/coalesce.ts (unit-tested in lib/__tests__/coalesce.spec.ts).
  const coalescer = useRef<ReturnType<typeof createCoalescer> | null>(null);
  if (coalescer.current === null) {
    coalescer.current = createCoalescer(() => {
      void refetch();
    }, COALESCE_MS);
  }

  useEffect(() => {
    if (!clinicId) return;

    // Use a channel name without a date suffix so the subscription stays
    // active across midnight boundaries without needing to re-subscribe.
    // The Realtime filter on clinic_id is what actually scopes the events.
    const channel = supabase
      .channel(`queue:${clinicId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          // queue_signals, NOT queue_entries. RLS restricts a patient to their
          // OWN queue_entries row and Realtime enforces RLS per subscriber, so
          // subscribing to queue_entries meant a waiting patient got no event
          // at all when the patient ahead of them was seen — their position sat
          // frozen. queue_signals is one PHI-free row per clinic that both
          // staff and portal patients may read, bumped by a statement-level
          // trigger on queue_entries. It also fires once per statement rather
          // than once per row.
          table: "queue_signals",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          // Re-fetch the queue: the signal deliberately carries no queue data,
          // and the patient join and appointment duration would not be in a
          // row payload anyway. Still coalesced, because one queue action can
          // run several statements.
          coalescer.current?.schedule();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Queue connection lost. Please refresh.");
        }
      });

    return () => {
      coalescer.current?.cancel();
      // Stop any in-flight refetch from applying after unmount.
      seqRef.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [supabase, clinicId]);

  return { queue, isLoading, error, changeToken };
}

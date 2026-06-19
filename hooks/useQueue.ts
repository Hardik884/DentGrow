"use client";

import { useEffect, useState, useCallback } from "react";
import { useBrowserSupabaseClient } from "@/lib/supabase/client";
import { getTodayQueue } from "@/actions/queue";
import type { QueueEntryWithPatient } from "@/types";

interface UseQueueOptions {
  clinicId: string;
  initialQueue?: QueueEntryWithPatient[];
}

interface UseQueueReturn {
  queue: QueueEntryWithPatient[];
  isLoading: boolean;
  error: string | null;
}

/**
 * useQueue
 *
 * Supabase Realtime subscription for the queue_entries table.
 *
 * - Accepts initialQueue from the Server Component (avoids loading flash).
 * - On any Realtime INSERT/UPDATE/DELETE event, re-fetches the full queue
 *   via getTodayQueue() Server Action so patient names and durations are fresh.
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

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getTodayQueue();
      if (result.error) {
        setError(result.error);
      } else {
        setQueue(result.data ?? []);
        setError(null);
      }
    } catch {
      setError("Failed to refresh queue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!clinicId) return;

    const today = new Date().toISOString().split("T")[0];

    const channel = supabase
      .channel(`queue:${clinicId}:${today}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entries",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          // Re-fetch full queue on any change (insert/update/delete).
          // This includes patient join + appointment duration — can't get
          // those from the Realtime payload alone.
          void refetch();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          setError("Queue connection lost. Please refresh.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, clinicId, refetch]);

  return { queue, isLoading, error };
}

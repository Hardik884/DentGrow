"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceQueue, skipPatient } from "@/actions/queue";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { formatTimeAgo } from "@/lib/utils";
import type { QueueEntryWithPatient } from "@/types";

interface QueueEntryProps {
  entry: QueueEntryWithPatient;
  showActions?: boolean;
}

/**
 * QueueEntry
 *
 * Single queue entry row with position, patient info, treatment duration,
 * and action buttons.
 *
 * Actions: "Call Next" (advanceQueue) + "Skip".
 * Both refresh the page via Realtime (useQueue re-fetches automatically).
 */
export function QueueEntry({ entry, showActions = false }: QueueEntryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceQueue();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleSkip() {
    setError(null);
    startTransition(async () => {
      const result = await skipPatient(entry.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const durationMinutes = entry.duration_minutes ?? 30;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Position number */}
          <span className="text-2xl font-bold text-gray-300 w-8 text-center tabular-nums">
            {entry.position}
          </span>

          <PatientAvatar name={entry.patient.name} size="sm" />

          <div>
            <p className="text-sm font-medium text-gray-900">
              {entry.patient.name}
            </p>
            <p className="text-xs text-gray-400">
              Checked in {formatTimeAgo(entry.checked_in_at)} ·{" "}
              <span className="text-blue-500">{durationMinutes} min</span>
            </p>
          </div>
        </div>

        {showActions && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? "…" : "Call Next"}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={isPending}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Skip
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 pl-11" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { advanceQueue, skipPatient } from "@/actions/queue";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Button } from "@/components/ui/button";
import { formatTimeAgo } from "@/lib/utils";
import type { QueueEntryWithPatient } from "@/types";

interface QueueEntryProps {
  entry: QueueEntryWithPatient;
  showActions?: boolean;
}

export function QueueEntry({ entry, showActions = false }: QueueEntryProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceQueue();
      if (result.error) setError(result.error);
    });
  }

  function handleSkip() {
    setError(null);
    startTransition(async () => {
      const result = await skipPatient(entry.id);
      if (result.error) setError(result.error);
    });
  }

  const durationMinutes = entry.duration_minutes ?? 30;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        {/* Identity block: badge + avatar + name/time stay on one line at all sizes */}
        <div className="flex items-center gap-3">
          {/* Position badge */}
          <div className="w-7 h-7 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-text-secondary tabular-nums">
              {entry.position}
            </span>
          </div>

          <PatientAvatar name={entry.patient.name} size="sm" />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {entry.patient.name}
            </p>
            <p className="text-xs text-text-secondary">
              {formatTimeAgo(entry.checked_in_at)} · {durationMinutes} min appt
            </p>
          </div>
        </div>

        {showActions && (
          <div className="flex gap-2 sm:gap-1.5 sm:shrink-0">
            <Button
              size="sm"
              onClick={handleAdvance}
              disabled={isPending}
              isLoading={isPending}
              className="h-10 sm:h-8 flex-1 sm:flex-none"
            >
              Call Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              disabled={isPending}
              className="h-10 sm:h-8 flex-1 sm:flex-none"
            >
              Skip
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-danger pl-10" role="alert">{error}</p>
      )}
    </div>
  );
}

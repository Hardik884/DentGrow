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
      <div className="flex items-center gap-3">
        {/* Position badge */}
        <div className="w-7 h-7 rounded-full bg-[#F4F4F5] flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-[#71717A] tabular-nums">
            {entry.position}
          </span>
        </div>

        <PatientAvatar name={entry.patient.name} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#09090B] truncate">
            {entry.patient.name}
          </p>
          <p className="text-xs text-[#71717A]">
            {formatTimeAgo(entry.checked_in_at)} · {durationMinutes} min appt
          </p>
        </div>

        {showActions && (
          <div className="flex gap-1.5 shrink-0">
            <Button
              size="sm"
              onClick={handleAdvance}
              disabled={isPending}
              isLoading={isPending}
            >
              Call Next
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              disabled={isPending}
            >
              Skip
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-[#DC2626] pl-10" role="alert">{error}</p>
      )}
    </div>
  );
}

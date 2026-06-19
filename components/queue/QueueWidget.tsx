"use client";

import { useQueue } from "@/hooks/useQueue";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import type { QueueEntryWithPatient } from "@/types";

interface QueueWidgetProps {
  initialQueue?: QueueEntryWithPatient[];
  clinicId?: string;
}

/**
 * QueueWidget
 *
 * Compact queue widget for staff dashboards.
 * Shows: current patient (in_progress) + next patient (first waiting).
 * Realtime via useQueue hook.
 */
export function QueueWidget({ initialQueue = [], clinicId = "" }: QueueWidgetProps) {
  const { queue } = useQueue({ clinicId, initialQueue });

  const current = queue.find((e) => e.status === "in_progress");
  const next = queue.filter((e) => e.status === "waiting")[0];

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold text-gray-900 text-sm">Live Queue</h2>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Now</p>
          {current ? (
            <div className="flex items-center gap-2 mt-1">
              <PatientAvatar name={current.patient.name} size="sm" />
              <span className="text-sm font-medium">{current.patient.name}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">—</p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Next</p>
          {next ? (
            <div className="flex items-center gap-2 mt-1">
              <PatientAvatar name={next.patient.name} size="sm" />
              <span className="text-sm text-gray-600">{next.patient.name}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-1">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

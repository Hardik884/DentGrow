"use client";

import { useQueue } from "@/hooks/useQueue";
import type { QueueEntryWithPatient } from "@/types";

interface QueuePositionCardProps {
  patientId?: string;
  initialQueue?: QueueEntryWithPatient[];
  clinicId?: string;
  /** Fallback average duration if appointment-specific durations are unavailable */
  averageAppointmentDuration?: number;
}

/**
 * QueuePositionCard
 *
 * Patient portal — live queue position display.
 *
 * Shows:
 * - Patient's queue number
 * - Patients ahead count
 * - Estimated wait time = SUM of duration_minutes for all patients ahead
 *   (falls back to patientsAhead × averageAppointmentDuration if durations unavailable)
 * - Which queue number is currently being seen
 *
 * Realtime: re-renders automatically via useQueue hook on any queue change.
 * RLS: patient only receives their own entry from Realtime; position count
 *      comes from the initialQueue passed from the server component.
 */
export function QueuePositionCard({
  patientId,
  initialQueue = [],
  clinicId = "",
  averageAppointmentDuration = 30,
}: QueuePositionCardProps) {
  const { queue } = useQueue({ clinicId, initialQueue });

  const myEntry = queue.find((e) => e.patient_id === patientId);
  const inProgressEntry = queue.find((e) => e.status === "in_progress");

  if (!myEntry) {
    return (
      <div className="bg-white border rounded-lg p-6 text-center space-y-2">
        <p className="text-gray-500 text-sm">
          You are not currently in the queue.
        </p>
        <p className="text-xs text-gray-400">
          Check in with the receptionist when you arrive.
        </p>
      </div>
    );
  }

  const entriesAhead = queue.filter(
    (e) => e.status === "waiting" && e.position < myEntry.position
  );

  const patientsAhead = entriesAhead.length;

  // Use appointment-specific durations for accurate wait time
  const estimatedWait =
    entriesAhead.length > 0
      ? entriesAhead.reduce(
          (sum, e) => sum + (e.duration_minutes ?? averageAppointmentDuration),
          0
        )
      : patientsAhead * averageAppointmentDuration;

  const isBeingSeen = myEntry.status === "in_progress";

  if (isBeingSeen) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-2">
        <p className="text-green-600 text-sm font-semibold uppercase tracking-wide">
          It&apos;s Your Turn!
        </p>
        <p className="text-4xl font-bold text-green-700">#{myEntry.position}</p>
        <p className="text-green-600 text-sm">Please proceed to the chair.</p>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center space-y-4">
      <p className="text-blue-600 text-sm font-semibold uppercase tracking-wide">
        Your Queue Number
      </p>
      <p className="text-5xl font-bold text-blue-700 tabular-nums">
        #{myEntry.position}
      </p>

      <div className="grid grid-cols-3 gap-4 pt-2 border-t border-blue-200">
        <div>
          <p className="text-2xl font-bold text-blue-700">{patientsAhead}</p>
          <p className="text-xs text-blue-500 mt-0.5">ahead of you</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-blue-700">
            ~{estimatedWait}
          </p>
          <p className="text-xs text-blue-500 mt-0.5">min wait</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-blue-700">
            {inProgressEntry ? `#${inProgressEntry.position}` : "—"}
          </p>
          <p className="text-xs text-blue-500 mt-0.5">now seeing</p>
        </div>
      </div>

      {patientsAhead === 0 && (
        <p className="text-sm text-blue-600 font-medium">
          You&apos;re next! Please be ready.
        </p>
      )}
    </div>
  );
}

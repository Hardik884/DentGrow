"use client";

import { useEffect, useState } from "react";
import { useQueue } from "@/hooks/useQueue";
import { getQueueStatus } from "@/actions/queue";
import type { QueueEntryWithPatient } from "@/types";

interface QueueStatus {
  position: number | null;
  patientsAhead: number;
  estimatedWaitMinutes: number;
  currentQueueNumber: number | null;
  myStatus: string | null;
}

interface QueuePositionCardProps {
  patientId?: string;
  initialQueue?: QueueEntryWithPatient[];
  clinicId?: string;
  averageAppointmentDuration?: number;
  initialStatus?: QueueStatus;
}

const EMPTY_STATUS: QueueStatus = {
  position: null,
  patientsAhead: 0,
  estimatedWaitMinutes: 0,
  currentQueueNumber: null,
  myStatus: null,
};

export function QueuePositionCard({
  patientId,
  initialQueue = [],
  clinicId = "",
  averageAppointmentDuration = 30,
  initialStatus,
}: QueuePositionCardProps) {
  const { queue } = useQueue({ clinicId, initialQueue });
  const [status, setStatus] = useState<QueueStatus>(initialStatus ?? EMPTY_STATUS);

  // Track the patient's realtime entry status for effect dependencies
  const myEntryStatus = queue.find((e) => e.patient_id === patientId)?.status ?? null;

  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    void (async () => {
      const result = await getQueueStatus(patientId);
      if (!cancelled && result.data) setStatus(result.data);
    })();
    return () => { cancelled = true; };
  }, [queue.length, myEntryStatus, patientId]);

  const myEntry = queue.find((e) => e.patient_id === patientId);

  // Derive effective status: real-time queue entry takes precedence over
  // the last-fetched server status.
  const effectiveStatus = myEntry?.status ?? status.myStatus;

  // Completed entries are no longer in the active queue — show empty state.
  if (
    effectiveStatus === "completed" ||
    (!myEntry && status.position == null)
  ) {
    const isCompleted = effectiveStatus === "completed";
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-8 text-center space-y-2">
        <div className="h-12 w-12 rounded-full bg-[#F4F4F5] flex items-center justify-center mx-auto mb-4">
          {isCompleted ? (
            <svg className="h-5 w-5 text-[#16A34A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-[#A1A1AA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
            </svg>
          )}
        </div>
        {isCompleted ? (
          <>
            <p className="text-sm font-medium text-[#09090B]">Appointment complete</p>
            <p className="text-xs text-[#71717A]">
              Your visit has been completed. Thank you!
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-[#09090B]">Not in queue</p>
            <p className="text-xs text-[#71717A]">
              Check in with the receptionist when you arrive.
            </p>
          </>
        )}
      </div>
    );
  }

  const position = myEntry?.position ?? status.position ?? 0;
  const myStatus = effectiveStatus;
  const isBeingSeen = myStatus === "in_progress";

  let patientsAhead = status.patientsAhead;
  let estimatedWait = status.estimatedWaitMinutes;

  if (patientsAhead === 0 && !isBeingSeen && status.position == null) {
    const entriesAhead = myEntry
      ? queue.filter((e) => e.status === "waiting" && e.position < myEntry.position)
      : [];
    patientsAhead = entriesAhead.length;
    estimatedWait = entriesAhead.length > 0
      ? entriesAhead.reduce((sum, e) => sum + (e.duration_minutes ?? averageAppointmentDuration), 0)
      : 0;
  }

  if (isBeingSeen) {
    return (
      <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-[#16A34A] flex items-center justify-center mx-auto">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-[#16A34A] uppercase tracking-wider">It&apos;s Your Turn</p>
        <p className="text-5xl font-semibold text-[#09090B] tabular-nums">#{position}</p>
        <p className="text-sm text-[#71717A]">Please proceed to the dental chair.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-6 py-8 text-center space-y-3 border-b border-[#E4E4E7]">
        <p className="text-xs font-semibold text-[#71717A] uppercase tracking-wider">Your Queue Number</p>
        <p className="text-6xl font-semibold text-[#09090B] tabular-nums">#{position}</p>
        {patientsAhead === 0 && (
          <p className="text-sm font-medium text-[#16A34A]">You&apos;re next — please be ready!</p>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-[#F4F4F5]">
        <StatCell value={String(patientsAhead)} label="Ahead of you" />
        <StatCell value={`~${estimatedWait}m`} label="Est. wait" />
        <StatCell
          value={status.currentQueueNumber !== null ? `#${status.currentQueueNumber}` : "—"}
          label="Now seeing"
        />
      </div>
    </div>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-xl font-semibold text-[#09090B] tabular-nums">{value}</p>
      <p className="text-xs text-[#71717A] mt-0.5">{label}</p>
    </div>
  );
}

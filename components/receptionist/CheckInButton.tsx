"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInPatient } from "@/actions/queue";

interface CheckInButtonProps {
  appointmentId: string;
  isCheckedIn?: boolean;
}

/**
 * CheckInButton
 *
 * Receptionist action — checks in a patient on arrival.
 * Creates a queue_entries row via actions/queue.ts → checkInPatient().
 * Refreshes the page on success so server components re-render.
 */
export function CheckInButton({
  appointmentId,
  isCheckedIn = false,
}: CheckInButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDone, setIsDone] = useState(isCheckedIn);
  const [error, setError] = useState<string | null>(null);

  function handleCheckIn() {
    setError(null);
    startTransition(async () => {
      const result = await checkInPatient(appointmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsDone(true);
      router.refresh();
    });
  }

  if (isDone) {
    return (
      <div className="px-4 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-md border border-green-200 inline-flex items-center gap-1">
        <span aria-hidden>✓</span> Checked In
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleCheckIn}
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? "Checking in…" : "Check In Patient"}
      </button>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

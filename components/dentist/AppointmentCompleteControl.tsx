"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { updateAppointmentStatus } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { AppointmentStatus } from "@/types";

interface AppointmentCompleteControlProps {
  appointmentId: string;
  currentStatus?: AppointmentStatus;
}

/**
 * AppointmentCompleteControl
 *
 * Patient Visit page action. Shows a single "Mark as Complete" button while the
 * appointment is still active (not completed / cancelled / no_show). All other
 * operational actions (Check In, Mark In Progress, Reschedule, Cancel) live in
 * the appointments table now.
 *
 * Completion reuses the existing updateAppointmentStatus server action (which
 * runs the authoritative completion cascade). Because the lifecycle is strictly
 * ordered (scheduled → checked_in → in_progress → completed), we advance
 * through any intermediate transitions with the same action rather than
 * duplicating status logic.
 */
const COMPLETION_PATH: AppointmentStatus[] = [
  "scheduled",
  "checked_in",
  "in_progress",
  "completed",
];

export function AppointmentCompleteControl({
  appointmentId,
  currentStatus = "scheduled",
}: AppointmentCompleteControlProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Only active appointments can be completed. Terminal states hide the button.
  const startIdx = COMPLETION_PATH.indexOf(currentStatus);
  const canComplete = startIdx >= 0 && currentStatus !== "completed";

  if (!canComplete) return null;

  function markComplete() {
    setError(null);
    startTransition(async () => {
      // Advance through each remaining valid transition up to "completed".
      for (let i = startIdx + 1; i < COMPLETION_PATH.length; i++) {
        const res = await updateAppointmentStatus({
          appointment_id: appointmentId,
          new_status: COMPLETION_PATH[i],
        });
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      router.refresh();
    });
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[#09090B]">Actions</h3>

      {error && (
        <p className="text-xs text-[#DC2626]" role="alert">
          {error}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        onClick={markComplete}
        isLoading={isPending}
        disabled={isPending}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Mark as Complete
      </Button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateAppointmentStatus } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { VALID_APPOINTMENT_TRANSITIONS } from "@/types";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import type { AppointmentStatus } from "@/types";

interface CompleteAppointmentButtonProps {
  appointmentId: string;
  currentStatus: AppointmentStatus;
}

/**
 * CompleteAppointmentButton
 *
 * Focused control that replaces the previous multi-button "Actions" card on the
 * Patient Visit page. Shows only the "Complete Appointment" action, and only
 * when completing is a valid transition from the current status. Otherwise it
 * shows the current status text. Reuses updateAppointmentStatus unchanged.
 */
export function CompleteAppointmentButton({
  appointmentId,
  currentStatus,
}: CompleteAppointmentButtonProps) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canComplete = VALID_APPOINTMENT_TRANSITIONS[currentStatus]?.includes("completed");
  const isCompleted = currentStatus === "completed";

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentStatus({
        appointment_id: appointmentId,
        new_status: "completed",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    });
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl p-5 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-[#151918]">
          {isCompleted ? "Appointment Complete" : "Mark as Complete"}
        </h3>
        <p className="text-xs text-[#737A76] mt-0.5">
          {isCompleted
            ? "This appointment has been marked complete."
            : canComplete
              ? "Mark this appointment as complete when the visit is finished."
              : `Current status: ${APPOINTMENT_STATUS_LABELS[currentStatus] ?? currentStatus}.`}
        </p>
        {error && <p className="text-xs text-[#DC2626] mt-1" role="alert">{error}</p>}
      </div>

      {canComplete && (
        <Button size="sm" onClick={handleComplete} isLoading={isPending} disabled={isPending}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Mark as Complete
        </Button>
      )}
    </div>
  );
}

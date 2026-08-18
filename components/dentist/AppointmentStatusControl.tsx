"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updateAppointmentStatus, cancelAppointment } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RescheduleModal } from "@/components/shared/RescheduleModal";
import { VALID_APPOINTMENT_TRANSITIONS } from "@/types";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import type { AppointmentStatus } from "@/types";

interface AppointmentStatusControlProps {
  appointmentId: string;
  currentStatus?: AppointmentStatus;
  currentScheduledAt?: string;
  clinicToday?: string;
}

const DESTRUCTIVE: AppointmentStatus[] = ["cancelled", "no_show"];

export function AppointmentStatusControl({
  appointmentId,
  currentStatus = "scheduled",
  currentScheduledAt = new Date().toISOString(),
  clinicToday,
}: AppointmentStatusControlProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<AppointmentStatus | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const validNext = VALID_APPOINTMENT_TRANSITIONS[currentStatus];

  function handleTransition(newStatus: AppointmentStatus) {
    setError(null);
    startTransition(async () => {
      let result;
      if (newStatus === "cancelled") {
        result = await cancelAppointment(appointmentId);
      } else {
        result = await updateAppointmentStatus({ appointment_id: appointmentId, new_status: newStatus });
      }
      if (result.error) setError(result.error);
      else {
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      }
      setConfirmAction(null);
    });
  }

  const isTerminal = validNext.length === 0;

  if (isTerminal) {
    return (
      <div className="bg-white border border-[#E3E9E6] rounded-xl p-5">
        <p className="text-sm text-[#737A76]">
          Appointment is <strong className="text-[#151918]">{APPOINTMENT_STATUS_LABELS[currentStatus]}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-[#151918]">Actions</h3>

      {error && (
        <p className="text-xs text-[#DC2626]" role="alert">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Reschedule */}
        {!["completed", "cancelled", "no_show"].includes(currentStatus) && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => setShowReschedule(true)}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Reschedule
          </Button>
        )}

        {/* Status transitions */}
        {validNext.map((status) => {
          const isDestructive = DESTRUCTIVE.includes(status);
          const label = APPOINTMENT_STATUS_LABELS[status] ?? status.replace("_", " ");
          return (
            <Button
              key={status}
              variant={isDestructive ? "danger" : "default"}
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={() => isDestructive ? setConfirmAction(status) : handleTransition(status)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      {confirmAction && (
        <ConfirmDialog
          open={true}
          title={`Confirm: ${APPOINTMENT_STATUS_LABELS[confirmAction]}`}
          description={`Are you sure you want to mark this appointment as "${APPOINTMENT_STATUS_LABELS[confirmAction]}"? This cannot be undone.`}
          confirmLabel="Yes, proceed"
          variant="danger"
          onConfirm={() => handleTransition(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          isLoading={isPending}
        />
      )}

      {showReschedule && (
        <RescheduleModal
          appointmentId={appointmentId}
          currentScheduledAt={currentScheduledAt}
          onClose={() => setShowReschedule(false)}
          clinicToday={clinicToday}
        />
      )}
    </div>
  );
}

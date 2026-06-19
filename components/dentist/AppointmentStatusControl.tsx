"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAppointmentStatus, cancelAppointment } from "@/actions/appointments";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RescheduleModal } from "@/components/shared/RescheduleModal";
import { VALID_APPOINTMENT_TRANSITIONS } from "@/types";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

interface AppointmentStatusControlProps {
  appointmentId: string;
  currentStatus?: AppointmentStatus;
  currentScheduledAt?: string;
}

/**
 * AppointmentStatusControl
 *
 * Status lifecycle state machine UI — dentist view.
 * Renders valid next-status actions based on VALID_APPOINTMENT_TRANSITIONS.
 *
 * Destructive actions (cancel, no_show) require ConfirmDialog confirmation.
 * Reschedule opens RescheduleModal slot picker.
 *
 * Calls:
 *   updateAppointmentStatus() for lifecycle transitions
 *   cancelAppointment() for cancel action
 *   rescheduleAppointment() via RescheduleModal
 */
export function AppointmentStatusControl({
  appointmentId,
  currentStatus = "scheduled",
  currentScheduledAt = new Date().toISOString(),
}: AppointmentStatusControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<AppointmentStatus | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validNext = VALID_APPOINTMENT_TRANSITIONS[currentStatus];
  const DESTRUCTIVE: AppointmentStatus[] = ["cancelled", "no_show"];

  function handleTransition(newStatus: AppointmentStatus) {
    setError(null);
    startTransition(async () => {
      let result;
      if (newStatus === "cancelled") {
        result = await cancelAppointment(appointmentId);
      } else {
        result = await updateAppointmentStatus({
          appointment_id: appointmentId,
          new_status: newStatus,
        });
      }
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setConfirmAction(null);
    });
  }

  const isTerminal = validNext.length === 0;

  if (isTerminal) {
    return (
      <div className="bg-white border rounded-lg p-4">
        <p className="text-sm text-gray-500">
          This appointment is{" "}
          <strong>{APPOINTMENT_STATUS_LABELS[currentStatus]}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Actions</h3>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Reschedule — available for non-terminal statuses */}
        {!["completed", "cancelled", "no_show"].includes(currentStatus) && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowReschedule(true)}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Reschedule
          </button>
        )}

        {/* Status transition buttons */}
        {validNext.map((status) => {
          const isDestructive = DESTRUCTIVE.includes(status);
          const label = APPOINTMENT_STATUS_LABELS[status] ?? status.replace("_", " ");
          return (
            <button
              key={status}
              type="button"
              disabled={isPending}
              onClick={() =>
                isDestructive ? setConfirmAction(status) : handleTransition(status)
              }
              className={
                isDestructive
                  ? "px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  : "px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              }
            >
              {isPending ? "Updating…" : label}
            </button>
          );
        })}
      </div>

      {/* Destructive confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={true}
          title={`Confirm: ${APPOINTMENT_STATUS_LABELS[confirmAction]}`}
          description={`Are you sure you want to mark this appointment as "${APPOINTMENT_STATUS_LABELS[confirmAction]}"? This cannot be undone.`}
          confirmLabel="Yes, proceed"
          onConfirm={() => handleTransition(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          isLoading={isPending}
        />
      )}

      {/* Reschedule modal */}
      {showReschedule && (
        <RescheduleModal
          appointmentId={appointmentId}
          currentScheduledAt={currentScheduledAt}
          onClose={() => setShowReschedule(false)}
        />
      )}
    </div>
  );
}

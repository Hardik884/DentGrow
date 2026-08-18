"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { checkInPatient } from "@/actions/queue";
import { updateAppointmentStatus, cancelAppointment } from "@/actions/appointments";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { RescheduleReceptionistPanel } from "@/components/receptionist/RescheduleReceptionistPanel";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Button } from "@/components/ui/button";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import { CheckCircle2, Clock, X, UserX } from "lucide-react";
import type { AppointmentWithPatient, AppointmentStatus } from "@/types";

interface TodayAppointmentListWithActionsProps {
  appointments: AppointmentWithPatient[];
  timezone: string;
  clinicToday?: string;
}

/**
 * Client component that displays today's appointments with inline action buttons.
 * Actions: Check In, Cancel, Reschedule, Mark No Show
 * Used in receptionist dashboard for quick workflow actions.
 */
export function TodayAppointmentListWithActions({
  appointments,
  timezone,
  clinicToday,
}: TodayAppointmentListWithActionsProps) {
  return (
    <div className="divide-y divide-[#F4F4F5]">
      {appointments.map((appointment) => (
        <AppointmentRowWithActions
          key={appointment.id}
          appointment={appointment}
          timezone={timezone}
          clinicToday={clinicToday}
        />
      ))}
    </div>
  );
}

interface AppointmentRowWithActionsProps {
  appointment: AppointmentWithPatient;
  timezone: string;
  clinicToday?: string;
}

function AppointmentRowWithActions({
  appointment,
  timezone,
  clinicToday,
}: AppointmentRowWithActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCheckedIn, setIsCheckedIn] = useState(appointment.status === "checked_in");
  const [confirmAction, setConfirmAction] = useState<"cancel" | "no_show" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = appointment.status as AppointmentStatus;
  const isTerminal = ["completed", "cancelled", "no_show"].includes(status);
  const canCheckIn = status === "scheduled";
  const canCancel = !isTerminal;
  const canMarkNoShow = status === "scheduled" || status === "checked_in";

  function handleCheckIn() {
    setError(null);
    startTransition(async () => {
      const result = await checkInPatient(appointment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsCheckedIn(true);
      router.refresh();
    });
  }

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointment(appointment.id);
      if (result.error) {
        setError(result.error);
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      router.refresh();
    });
  }

  function handleNoShow() {
    setError(null);
    startTransition(async () => {
      const result = await updateAppointmentStatus({
        appointment_id: appointment.id,
        new_status: "no_show",
      });
      if (result.error) {
        setError(result.error);
        setConfirmAction(null);
        return;
      }
      setConfirmAction(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="px-5 py-4 space-y-3">
        {/* Appointment Info */}
        <div className="flex items-start gap-3">
          <PatientAvatar name={appointment.patient.name} size="sm" />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/receptionist/patients/${appointment.patient_id}`}
                  className="text-sm font-medium text-[#09090B] hover:text-accent truncate block"
                >
                  {appointment.patient.name}
                </Link>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3 w-3 text-[#A1A1AA] shrink-0" aria-hidden />
                  <p className="text-xs text-[#71717A]">
                    {formatDateTimeInTimezone(appointment.scheduled_at, timezone)}
                    {" · "}
                    {appointment.duration_minutes} min
                    {appointment.source
                      ? ` · ${APPOINTMENT_SOURCE_LABELS[appointment.source] ?? appointment.source}`
                      : ""}
                  </p>
                </div>
                {appointment.chief_complaints && (
                  <p className="text-xs text-[#A1A1AA] truncate mt-0.5">{appointment.chief_complaints}</p>
                )}
              </div>
              
              <AppointmentStatusBadge status={status} />
            </div>

            {/* Action Buttons */}
            {!isTerminal && (
              <div className="flex flex-wrap gap-2 mt-3">
                {/* Check In */}
                {canCheckIn && !isCheckedIn && (
                  <Button
                    size="xs"
                    onClick={handleCheckIn}
                    disabled={isPending}
                    isLoading={isPending}
                  >
                    Check In
                  </Button>
                )}

                {isCheckedIn && status === "scheduled" && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#F0FDF4] text-[#16A34A] text-xs font-medium rounded-md border border-[#BBF7D0]">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Checked In
                  </div>
                )}

                {/* Reschedule */}
                <RescheduleReceptionistPanel
                  appointmentId={appointment.id}
                  currentScheduledAt={appointment.scheduled_at}
                  clinicToday={clinicToday}
                  compact
                />

                {/* Mark No Show */}
                {canMarkNoShow && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setConfirmAction("no_show")}
                    disabled={isPending}
                  >
                    <UserX className="h-3 w-3" aria-hidden />
                    No Show
                  </Button>
                )}

                {/* Cancel */}
                {canCancel && (
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => setConfirmAction("cancel")}
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" aria-hidden />
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <p className="text-xs text-[#DC2626] mt-2" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {confirmAction === "cancel" && (
        <ConfirmDialog
          open={true}
          title="Cancel Appointment"
          description="Are you sure you want to cancel this appointment? This cannot be undone."
          confirmLabel="Yes, cancel it"
          variant="danger"
          onConfirm={handleCancel}
          onCancel={() => setConfirmAction(null)}
          isLoading={isPending}
        />
      )}

      {/* No Show Confirmation Dialog */}
      {confirmAction === "no_show" && (
        <ConfirmDialog
          open={true}
          title="Mark as No Show"
          description="Are you sure you want to mark this appointment as no-show? This cannot be undone."
          confirmLabel="Yes, mark as no-show"
          variant="danger"
          onConfirm={handleNoShow}
          onCancel={() => setConfirmAction(null)}
          isLoading={isPending}
        />
      )}
    </>
  );
}

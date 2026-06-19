"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAppointment } from "@/actions/appointments";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface CancelAppointmentButtonProps {
  appointmentId: string;
  /** Optional redirect after successful cancel */
  redirectHref?: string;
}

/**
 * CancelAppointmentButton
 *
 * Cancels an appointment after confirmation dialog.
 * Used by: receptionist detail page, portal detail page.
 * Calls: actions/appointments.ts → cancelAppointment()
 */
export function CancelAppointmentButton({
  appointmentId,
  redirectHref,
}: CancelAppointmentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointment(appointmentId);
      if (result.error) {
        setError(result.error);
        setOpen(false);
        return;
      }
      setOpen(false);
      if (redirectHref) {
        router.push(redirectHref);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
        aria-label="Cancel appointment"
      >
        Cancel Appointment
      </button>

      {error && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={open}
        title="Cancel Appointment"
        description="Are you sure you want to cancel this appointment? This cannot be undone."
        confirmLabel="Yes, cancel it"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        isLoading={isPending}
      />
    </>
  );
}

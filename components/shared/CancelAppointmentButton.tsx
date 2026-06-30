"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { cancelAppointment } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface CancelAppointmentButtonProps {
  appointmentId: string;
  redirectHref?: string;
}

export function CancelAppointmentButton({ appointmentId, redirectHref }: CancelAppointmentButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAppointment(appointmentId);
      if (result.error) { setError(result.error); setOpen(false); return; }
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      if (redirectHref) router.push(redirectHref);
      else router.refresh();
    });
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <X className="h-3.5 w-3.5" aria-hidden />
        Cancel Appointment
      </Button>

      {error && <p className="text-xs text-[#DC2626] mt-1" role="alert">{error}</p>}

      <ConfirmDialog
        open={open}
        title="Cancel Appointment"
        description="Are you sure you want to cancel this appointment? This cannot be undone."
        confirmLabel="Yes, cancel it"
        variant="danger"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        isLoading={isPending}
      />
    </>
  );
}

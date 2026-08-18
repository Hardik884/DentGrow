"use client";

import { useState } from "react";
import { PaymentForm } from "@/components/dentist/PaymentForm";
import { Dialog } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface RecordAppointmentPaymentProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * RecordAppointmentPayment
 *
 * Client wrapper that opens the shared PaymentForm inside a centered dialog,
 * pre-linked to the current appointment + patient. On success it closes the
 * dialog and refreshes the page so the payments list and totals update.
 */
export function RecordAppointmentPayment({
  appointmentId,
  patientId,
  patientName,
}: RecordAppointmentPaymentProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium bg-accent text-accent-foreground rounded-md hover:bg-accent-hover transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Record Payment
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Record Payment" size="lg">
        <div className="p-4">
          <PaymentForm
            patientId={patientId}
            patientName={patientName}
            appointmentId={appointmentId}
            onCancel={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false);
            }}
          />
        </div>
      </Dialog>
    </>
  );
}

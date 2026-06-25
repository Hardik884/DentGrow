"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentForm } from "@/components/dentist/PaymentForm";
import { Plus, X } from "lucide-react";

interface RecordAppointmentPaymentProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * RecordAppointmentPayment
 *
 * Client wrapper that toggles an inline PaymentForm pre-linked to the current
 * appointment + patient. On success it closes the form and refreshes the page
 * so the payments list and totals update.
 */
export function RecordAppointmentPayment({
  appointmentId,
  patientId,
  patientName,
}: RecordAppointmentPaymentProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Record Payment
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="w-full max-w-2xl mt-12">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">Record Payment</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-white/80 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <PaymentForm
          patientId={patientId}
          patientName={patientName}
          appointmentId={appointmentId}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}

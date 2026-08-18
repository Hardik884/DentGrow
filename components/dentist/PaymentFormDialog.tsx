"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { PaymentForm } from "./PaymentForm";

interface PaymentFormDialogProps {
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  /** Pre-links the payment to a specific treatment (treatment-wise tracking). */
  treatmentId?: string;
  /** Pre-fills the Amount field (e.g. remaining balance for a treatment). Editable. */
  defaultAmount?: number;
  /** Dialog title. Defaults to "Record Payment". */
  title?: string;
  /** Class names applied to the trigger button. */
  triggerClassName?: string;
  /** When set, the trigger renders via the shared Button for consistent styling. */
  triggerVariant?: ButtonVariant;
  /** Trigger Button size (only used with triggerVariant). Defaults to "sm". */
  triggerSize?: ButtonSize;
  /** Trigger button content. */
  children: ReactNode;
}

/**
 * PaymentFormDialog
 *
 * Inline launcher for the shared PaymentForm. Opens a centered dialog instead
 * of navigating to /payments/new. Reuses PaymentForm and the recordPayment
 * server action unchanged; on success it closes and refreshes the current page.
 */
export function PaymentFormDialog({
  patientId,
  patientName,
  appointmentId,
  treatmentId,
  defaultAmount,
  title = "Record Payment",
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: PaymentFormDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {triggerVariant ? (
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          {children}
        </Button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
          {children}
        </button>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <div className="p-4">
          <PaymentForm
            patientId={patientId}
            patientName={patientName}
            appointmentId={appointmentId}
            treatmentId={treatmentId}
            defaultAmount={defaultAmount}
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

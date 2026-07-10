"use client";

/**
 * OpdPaymentDialog
 *
 * Trigger button + centered inline modal for recording a standalone OPD
 * (consultation) payment. Reuses the shared PaymentForm with paymentType="opd"
 * and the existing recordPayment server action — no treatment selection, no
 * duplicated payment logic. OPD payments flow through the same ledger, so they
 * appear in payment history, revenue, analytics and daily totals automatically.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { PaymentForm } from "@/components/dentist/PaymentForm";
import { getCurrentUserDisplayName } from "@/actions/treatments";

interface OpdPaymentDialogProps {
  triggerClassName?: string;
  /** When set, the trigger renders via the shared Button for consistent styling. */
  triggerVariant?: ButtonVariant;
  /** Trigger Button size (only used with triggerVariant). Defaults to "sm". */
  triggerSize?: ButtonSize;
  children: ReactNode;
}

export function OpdPaymentDialog({
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: OpdPaymentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recordedBy, setRecordedBy] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open || recordedBy) return;
    getCurrentUserDisplayName().then((res) => {
      if (res.data) setRecordedBy(res.data);
    });
  }, [open, recordedBy]);

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

      <Dialog open={open} onClose={() => setOpen(false)} title="Add OPD Payment" size="md">
        <div className="p-4">
          <PaymentForm
            paymentType="opd"
            recordedByName={recordedBy}
            onCancel={() => setOpen(false)}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      </Dialog>
    </>
  );
}

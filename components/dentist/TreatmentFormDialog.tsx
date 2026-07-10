"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { TreatmentForm } from "./TreatmentForm";

interface TreatmentFormDialogProps {
  appointmentId?: string;
  patientId?: string;
  treatmentId?: string;
  /** Dialog title. Defaults to "Treatment". */
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
 * TreatmentFormDialog
 *
 * Inline launcher for the shared TreatmentForm. Opens a centered dialog instead
 * of navigating to a separate page. Reuses TreatmentForm and its create/update
 * server actions unchanged; on success it closes and refreshes the current page.
 */
export function TreatmentFormDialog({
  appointmentId,
  patientId,
  treatmentId,
  title = "Treatment",
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: TreatmentFormDialogProps) {
  const router = useRouter();
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

      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="xl">
        <div className="p-4">
          <TreatmentForm
            appointmentId={appointmentId}
            patientId={patientId}
            treatmentId={treatmentId}
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

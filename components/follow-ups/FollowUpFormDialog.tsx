"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { FollowUpForm } from "./FollowUpForm";
import type { FollowUpWithRelations } from "@/types";

interface FollowUpFormDialogProps {
  followUpId?: string;
  patientId?: string;
  patientName?: string;
  appointmentId?: string;
  treatmentId?: string;
  initialData?: FollowUpWithRelations;
  role?: "dentist" | "receptionist";
  /** When true, hides the related appointment/treatment dropdowns. */
  hideRelatedFields?: boolean;
  /** Dialog title. Defaults to "Follow-up Appointment". */
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
 * FollowUpFormDialog
 *
 * Inline launcher for the shared FollowUpForm. Opens a centered dialog instead
 * of navigating to /follow-ups/new. Reuses FollowUpForm and its create/update
 * server actions unchanged; on success it closes and refreshes the current page.
 */
export function FollowUpFormDialog({
  followUpId,
  patientId,
  patientName,
  appointmentId,
  treatmentId,
  initialData,
  role = "dentist",
  hideRelatedFields,
  title = "Follow-up Appointment",
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: FollowUpFormDialogProps) {
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
          <FollowUpForm
            followUpId={followUpId}
            patientId={patientId}
            patientName={patientName}
            appointmentId={appointmentId}
            treatmentId={treatmentId}
            initialData={initialData}
            role={role}
            hideRelatedFields={hideRelatedFields ?? !!appointmentId}
            onSuccess={() => {
              setOpen(false);
            }}
          />
        </div>
      </Dialog>
    </>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { AppointmentForm } from "./AppointmentForm";
import type { Patient } from "@/types";

interface AppointmentFormDialogProps {
  preselectedPatient?: Pick<Patient, "id" | "name">;
  clinicToday?: string;
  /** Dialog title. Defaults to "New Appointment". */
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
 * AppointmentFormDialog
 *
 * Inline launcher for the shared AppointmentForm. Opens a centered dialog
 * instead of navigating to /appointments/new. Reuses AppointmentForm and the
 * createAppointment server action unchanged; on success it closes and refreshes
 * the current page.
 */
export function AppointmentFormDialog({
  preselectedPatient,
  clinicToday,
  title = "New Appointment",
  triggerClassName,
  triggerVariant,
  triggerSize = "sm",
  children,
}: AppointmentFormDialogProps) {
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

      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="lg">
        <div className="p-4">
          <AppointmentForm
            preselectedPatient={preselectedPatient}
            clinicToday={clinicToday}
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

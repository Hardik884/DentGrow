"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PatientForm } from "@/components/shared/PatientForm";
import type { Patient } from "@/types";

interface PatientEditDialogProps {
  patient: Patient;
}

/**
 * PatientEditDialog
 *
 * Inline launcher for editing a patient. Opens the shared PatientForm in a
 * centered dialog instead of navigating to /patients/[id]/edit. Reuses
 * PatientForm + the updatePatient server action unchanged; on success it
 * closes and refreshes the current page.
 */
export function PatientEditDialog({ patient }: PatientEditDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Edit Patient" size="lg">
        <div className="p-4">
          <PatientForm
            patient={patient}
            onSuccess={(updated) => {
              setOpen(false);
              toast.success(`Patient "${updated.name}" updated.`);
            }}
          />
        </div>
      </Dialog>
    </>
  );
}

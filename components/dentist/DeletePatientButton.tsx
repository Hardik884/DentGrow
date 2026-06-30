"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { softDeletePatient } from "@/actions/patients";
import { queryKeys } from "@/lib/query/keys";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface DeletePatientButtonProps {
  patientId: string;
  patientName: string;
}

/**
 * DeletePatientButton
 *
 * Soft-deletes a patient after confirmation.
 * Dentist role only — the parent (PatientProfileHeader) conditionally
 * renders this component only when role === 'dentist'.
 *
 * On confirm: calls softDeletePatient(), then redirects to the
 * patients list. The server action cascades to appointments,
 * treatments, payments, and follow-ups.
 */
export function DeletePatientButton({
  patientId,
  patientName,
}: DeletePatientButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await softDeletePatient(patientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // A patient soft-delete cascades to appointments, treatments, payments,
      // and follow-ups — invalidate every affected cached list.
      queryClient.invalidateQueries({ queryKey: queryKeys.patients.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.treatments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.followUps.all });
      router.push("/dentist/patients");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200
                   rounded-md hover:bg-red-50 transition-colors"
        aria-label={`Delete patient ${patientName}`}
      >
        Delete
      </button>

      {error && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={open}
        title="Delete Patient"
        description={`Are you sure you want to delete ${patientName}? This will also remove all their appointments, treatments, payments, and follow-ups. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        isLoading={isPending}
      />
    </>
  );
}

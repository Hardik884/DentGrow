"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { softDeleteTreatment } from "@/actions/treatments";
import { queryKeys } from "@/lib/query/keys";

interface DeleteTreatmentButtonProps {
  treatmentId: string;
  treatmentType: string;
  patientId: string;
}

/**
 * DeleteTreatmentButton
 *
 * Client component — dentist only.
 * Confirms with an inline prompt before soft-deleting the treatment.
 */
export function DeleteTreatmentButton({
  treatmentId,
  treatmentType,
  patientId,
}: DeleteTreatmentButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await softDeleteTreatment(treatmentId);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.push(`/dentist/patients/${patientId}/treatments`);
      queryClient.invalidateQueries({ queryKey: queryKeys.treatments.all });
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">Delete this treatment?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="px-3 py-1.5 text-sm font-medium bg-danger text-danger-foreground rounded-md hover:bg-danger-hover disabled:opacity-50 transition-colors"
        >
          {isPending ? "Deleting..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm font-medium border border-border-strong rounded-md hover:bg-surface-secondary transition-colors"
        >
          Cancel
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={`Delete treatment: ${treatmentType}`}
      className="px-3 py-1.5 text-sm font-medium text-danger border border-danger-border rounded-md hover:bg-danger-bg transition-colors"
    >
      Delete
    </button>
  );
}

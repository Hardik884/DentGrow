"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { softDeleteTreatment } from "@/actions/treatments";

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
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700">Delete this treatment?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Deleting..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title={`Delete treatment: ${treatmentType}`}
      className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
    >
      Delete
    </button>
  );
}

import { getPatientTreatments } from "@/actions/treatments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatCurrency, TREATMENT_STATUS_LABELS } from "@/lib/utils";
import type { TreatmentStatus } from "@/types";

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

/**
 * TreatmentHistoryList
 *
 * Patient portal — treatment history.
 * Uses getPatientTreatments() which resolves the patient via portal link.
 * internal_notes are NEVER shown here — patient_visible_notes only.
 */
export async function TreatmentHistoryList() {
  const result = await getPatientTreatments("");
  const treatments = result.data ?? [];

  if (result.error) {
    return (
      <div className="border rounded-lg p-4 text-sm text-red-600 text-center">
        Failed to load treatments. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {treatments.length === 0 ? (
        <div className="border rounded-lg p-6 text-sm text-gray-500 text-center">
          No treatment records found.
        </div>
      ) : (
        treatments.map((treatment) => (
          <div key={treatment.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-gray-900 text-sm">
                {treatment.treatment_type}
              </p>
              <StatusBadge
                label={TREATMENT_STATUS_LABELS[treatment.status as TreatmentStatus]}
                variant={STATUS_VARIANT_MAP[treatment.status as TreatmentStatus]}
              />
            </div>

            {treatment.patient_visible_notes && (
              <p className="text-sm text-gray-600">{treatment.patient_visible_notes}</p>
            )}

            <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t">
              <span>
                {treatment.performed_at
                  ? formatDate(treatment.performed_at)
                  : formatDate(treatment.created_at)}
              </span>
              <span className="font-medium text-gray-600">
                {formatCurrency(Number(treatment.cost))}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

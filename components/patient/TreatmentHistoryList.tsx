import { getPatientTreatments } from "@/actions/treatments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatCurrency, TREATMENT_STATUS_LABELS } from "@/lib/utils";
import { Stethoscope } from "lucide-react";
import type { TreatmentStatus } from "@/types";

const STATUS_VARIANT_MAP: Record<TreatmentStatus, "default" | "info" | "success" | "error"> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

export async function TreatmentHistoryList() {
  const result = await getPatientTreatments("");
  const treatments = result.data ?? [];

  if (result.error) {
    return (
      <div className="border border-[#FECACA] rounded-xl p-4 text-xs text-[#DC2626] bg-[#FEF2F2] text-center">
        Failed to load treatments. Please try again later.
      </div>
    );
  }

  if (treatments.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl">
        <EmptyState
          icon={<Stethoscope className="h-5 w-5" aria-hidden />}
          title="No treatment records"
          description="Your treatment history will appear here."
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
      {treatments.map((treatment) => (
        <div key={treatment.id} className="px-5 py-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium text-[#09090B]">{treatment.treatment_type}</p>
            <StatusBadge
              label={TREATMENT_STATUS_LABELS[treatment.status as TreatmentStatus]}
              variant={STATUS_VARIANT_MAP[treatment.status as TreatmentStatus]}
            />
          </div>

          {treatment.patient_visible_notes && (
            <p className="text-sm text-[#71717A]">{treatment.patient_visible_notes}</p>
          )}

          <div className="flex items-center justify-between text-xs text-[#A1A1AA] pt-1.5 border-t border-[#F4F4F5]">
            <span>
              {treatment.performed_at
                ? formatDate(treatment.performed_at)
                : formatDate(treatment.created_at)}
            </span>
            <span className="font-medium text-[#09090B]">
              {formatCurrency(Number(treatment.cost))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

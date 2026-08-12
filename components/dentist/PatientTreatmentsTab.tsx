import { getTreatmentsForPatient } from "@/actions/treatments";
import { TreatmentList } from "@/components/dentist/TreatmentList";
import { TreatmentFormDialog } from "@/components/dentist/TreatmentFormDialog";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { formatCurrency } from "@/lib/utils";
import { sumTreatmentCharges } from "@/lib/billing/balance";
import { Stethoscope } from "lucide-react";
import type { Treatment, TreatmentForReceptionist } from "@/types";

interface PatientTreatmentsTabProps {
  patientId: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

/**
 * PatientTreatmentsTab
 *
 * Server Component — treatments panel on patient profile.
 * Dentist: shows full records + add button + total cost.
 * Receptionist: shows treatment summary (no internal_notes), no add button.
 */
export async function PatientTreatmentsTab({
  patientId,
  role,
  baseHref,
}: PatientTreatmentsTabProps) {
  const result = await getTreatmentsForPatient(patientId);
  const treatments = (result.data ?? []) as (Treatment | TreatmentForReceptionist)[];
  const isDentist = role === "dentist";

  // Canonical charge: billable cost + OPD + X-ray, matching the outstanding
  // balance and the Payments tab on this same page (audit A6). A bare sum of
  // `cost` over all statuses disagreed with both.
  const totalCost = sumTreatmentCharges(treatments);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Treatments</h3>
          {treatments.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              Total cost: {formatCurrency(totalCost)}
            </p>
          )}
        </div>
        {isDentist && (
          <TreatmentFormDialog
            patientId={patientId}
            title="Add Treatment"
            triggerClassName={ACTION_BUTTON}
          >
            <Stethoscope className="h-3 w-3" aria-hidden />
            Add Treatment
          </TreatmentFormDialog>
        )}
      </div>

      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {/* Editable for the dentist here too: the patient profile is the other
          place a mistake gets noticed, and TreatmentList only honours this for
          the dentist role. */}
      <TreatmentList
        treatments={treatments}
        role={role}
        baseHref={baseHref}
        editable
      />
    </div>
  );
}

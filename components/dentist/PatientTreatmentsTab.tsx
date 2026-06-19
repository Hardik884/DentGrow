import Link from "next/link";
import { getTreatmentsForPatient } from "@/actions/treatments";
import { TreatmentList } from "@/components/dentist/TreatmentList";
import { formatCurrency } from "@/lib/utils";
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

  const totalCost = treatments.reduce(
    (sum, t) => sum + Number(t.cost ?? 0),
    0
  );

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
          <Link
            href={`${baseHref}/appointments`}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Treatment
          </Link>
        )}
      </div>

      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      <TreatmentList
        treatments={treatments}
        role={role}
        baseHref={baseHref}
      />
    </div>
  );
}

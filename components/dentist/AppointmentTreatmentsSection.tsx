import Link from "next/link";
import { getTreatmentsForAppointment } from "@/actions/treatments";
import { TreatmentList } from "@/components/dentist/TreatmentList";
import { formatCurrency } from "@/lib/utils";
import type { Treatment } from "@/types";

interface AppointmentTreatmentsSectionProps {
  appointmentId: string;
  patientId: string;
}

/**
 * AppointmentTreatmentsSection
 *
 * Server Component — treatments block on the appointment detail page.
 * Dentist: full records + add treatment button.
 */
export async function AppointmentTreatmentsSection({
  appointmentId,
  patientId,
}: AppointmentTreatmentsSectionProps) {
  const result = await getTreatmentsForAppointment(appointmentId);
  const treatments = (result.data ?? []) as Treatment[];

  const totalCost = treatments.reduce(
    (sum, t) => sum + Number(t.cost ?? 0),
    0
  );

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Treatments</h3>
          {treatments.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              Total: {formatCurrency(totalCost)}
            </p>
          )}
        </div>
        <Link
          href={`/dentist/appointments/${appointmentId}/new-treatment?patient=${patientId}`}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + Add Treatment
        </Link>
      </div>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      <TreatmentList treatments={treatments} role="dentist" baseHref="/dentist" />
    </div>
  );
}

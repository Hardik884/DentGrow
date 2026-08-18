/**
 * components/dental-chart/PatientDentalChartSection.tsx
 *
 * Server Component wrapper — fetches the patient's current (adult) dental
 * chart and renders the interactive client DentalChart. Used both as a
 * section on the Patient Visit page (with `appointmentId`, so new treatments
 * linked from a tooth attach to that visit) and as a tab on the Patient
 * Profile page (without `appointmentId` — TreatmentForm's own appointment
 * picker takes over there, same as PatientTreatmentsTab).
 *
 * Dentist-only, matching the dental chart's RLS/action access: a receptionist
 * or patient session simply won't be routed here (see the pages that render
 * this component).
 */

import { getPatientDentalChart } from "@/actions/dental-chart";
import { DentalChart } from "./DentalChart";

interface PatientDentalChartSectionProps {
  patientId: string;
  patientName?: string;
  appointmentId?: string;
}

export async function PatientDentalChartSection({
  patientId,
  patientName,
  appointmentId,
}: PatientDentalChartSectionProps) {
  const result = await getPatientDentalChart(patientId, "adult");

  if (result.error || !result.data) {
    return (
      <div className="bg-white border border-[#E3E9E6] rounded-xl p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Dental Chart</h3>
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error ?? "Failed to load dental chart."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">Dental Chart</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Click a tooth to view its condition and history, or link a treatment.
        </p>
      </div>
      <DentalChart
        patientId={patientId}
        patientName={patientName}
        appointmentId={appointmentId}
        initialChart={result.data}
      />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientTreatmentsTab } from "@/components/dentist/PatientTreatmentsTab";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "Patient Treatments — DentGrow",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /dentist/patients/[id]/treatments
 *
 * All treatments for a specific patient — dentist view.
 * Full treatment records including internal_notes.
 */
export default async function PatientTreatmentsPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  // Verify patient exists
  const patientResult = await getPatient(id);
  if (!patientResult.data) notFound();

  const patient = patientResult.data;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`${patient.name} — Treatments`}
        backHref={`/dentist/patients/${id}`}
      />

      <PatientTreatmentsTab
        patientId={id}
        role="dentist"
        baseHref="/dentist"
      />
    </div>
  );
}

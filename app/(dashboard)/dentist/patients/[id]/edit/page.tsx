import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientForm } from "@/components/shared/PatientForm";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "Edit Patient — DentGrow",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /dentist/patients/[id]/edit
 *
 * Edit patient form — dentist role.
 * Fetches the current patient data server-side to pre-populate the form.
 * PatientForm submits to actions/patients.ts → updatePatient().
 */
export default async function DentistEditPatientPage({ params }: Props) {
  const { id } = await params;

  const result = await getPatient(id);

  if (!result.data) notFound();

  const patient = result.data;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title={`Edit — ${patient.name}`}
        backHref={`/dentist/patients/${id}`}
      />
      <PatientForm
        patient={patient}
        successRedirect={`/dentist/patients/${id}`}
        cancelHref={`/dentist/patients/${id}`}
      />
    </div>
  );
}

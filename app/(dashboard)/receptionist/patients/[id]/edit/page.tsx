import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientForm } from "@/components/shared/PatientForm";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "Edit Patient",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /receptionist/patients/[id]/edit
 *
 * Edit patient form — receptionist role.
 * Receptionist can update name, phone, address, emergency contact.
 * Cannot delete. Cannot modify notes field (no clinical access).
 *
 * Role enforcement (no delete, no clinical fields) is handled server-side
 * in actions/patients.ts → updatePatient().
 */
export default async function ReceptionistEditPatientPage({ params }: Props) {
  const { id } = await params;

  const result = await getPatient(id);

  if (!result.data) notFound();

  const patient = result.data;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader
        title={`Edit — ${patient.name}`}
        backHref={`/receptionist/patients/${id}`}
      />
      <PatientForm
        patient={patient}
        successRedirect={`/receptionist/patients/${id}`}
        cancelHref={`/receptionist/patients/${id}`}
      />
    </div>
  );
}

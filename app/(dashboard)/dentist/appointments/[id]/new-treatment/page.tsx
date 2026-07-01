import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TreatmentForm } from "@/components/dentist/TreatmentForm";

export const metadata: Metadata = {
  title: "New Treatment",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ patient?: string }>;
}

/**
 * /dentist/appointments/[id]/new-treatment
 *
 * Create a new treatment linked to a specific appointment.
 * appointmentId and patientId are passed to TreatmentForm.
 */
export default async function NewTreatmentPage({ params, searchParams }: Props) {
  const [{ id: appointmentId }, { patient: patientId }] = await Promise.all([
    params,
    searchParams,
  ]);

  if (!appointmentId || !patientId) notFound();

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <PageHeader
        title="New Treatment"
        backHref={`/dentist/appointments/${appointmentId}`}
      />
      <TreatmentForm
        appointmentId={appointmentId}
        patientId={patientId}
      />
    </div>
  );
}

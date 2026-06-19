import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpForm } from "@/components/follow-ups/FollowUpForm";

export const metadata: Metadata = {
  title: "New Follow-Up — DentGrow",
};

interface Props {
  searchParams: Promise<{ patient?: string; appointment?: string; treatment?: string }>;
}

/**
 * /dentist/follow-ups/new
 *
 * Create a new follow-up.
 * Pre-fills patient_id, appointment_id, treatment_id from query params
 * when navigating from a patient/appointment/treatment detail page.
 */
export default async function NewFollowUpPage({ searchParams }: Props) {
  const { patient, appointment, treatment } = await searchParams;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="New Follow-Up"
        backHref={patient ? `/dentist/patients/${patient}?tab=follow-ups` : "/dentist/follow-ups"}
      />

      <FollowUpForm
        patientId={patient}
        appointmentId={appointment}
        treatmentId={treatment}
        role="dentist"
      />
    </div>
  );
}


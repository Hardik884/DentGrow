import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpForm } from "@/components/follow-ups/FollowUpForm";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "New Follow-Up — DentGrow",
};

interface Props {
  searchParams: Promise<{
    patient?: string;
    patientName?: string;
    appointment?: string;
    treatment?: string;
  }>;
}

/**
 * /dentist/follow-ups/new
 *
 * Create a new follow-up.
 *
 * Query params:
 *   patient     — pre-selects the patient (UUID)
 *   patientName — display name hint (avoids an extra fetch for the chip)
 *   appointment — pre-selects the related appointment (UUID)
 *   treatment   — pre-selects the related treatment (UUID)
 *
 * When navigating from a patient profile page, patient + patientName are set
 * so the patient selector shows immediately without a search interaction.
 * When launched from the global follow-ups list, the form shows an empty search.
 */
export default async function NewFollowUpPage({ searchParams }: Props) {
  const { patient, patientName, appointment, treatment } = await searchParams;

  // If we have a patient ID but no name hint, fetch the name server-side
  // so the form can render the selected-patient chip without a client round-trip.
  let resolvedPatientName = patientName;
  if (patient && !resolvedPatientName) {
    const result = await getPatient(patient);
    if (result.data) {
      resolvedPatientName = result.data.name;
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="New Follow-Up"
        backHref={
          patient
            ? `/dentist/patients/${patient}?tab=follow-ups`
            : "/dentist/follow-ups"
        }
      />

      <FollowUpForm
        patientId={patient}
        patientName={resolvedPatientName}
        appointmentId={appointment}
        treatmentId={treatment}
        role="dentist"
      />
    </div>
  );
}

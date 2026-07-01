import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpForm } from "@/components/follow-ups/FollowUpForm";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "New Follow-Up",
};

interface Props {
  searchParams: Promise<{
    patient?: string;
    patientName?: string;
    appointment?: string;
    treatment?: string;
    /** Return URL after successful creation — used when launched from appointment details */
    back?: string;
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
 *   back        — redirect URL on success (e.g. /dentist/appointments/{id})
 *
 * When navigating from an appointment page, patient + patientName + appointment
 * + back are all set so the form is pre-populated and returns to the same page.
 */
export default async function NewFollowUpPage({ searchParams }: Props) {
  const { patient, patientName, appointment, treatment, back } = await searchParams;

  // If we have a patient ID but no name hint, fetch the name server-side
  // so the form can render the selected-patient chip without a client round-trip.
  let resolvedPatientName = patientName;
  if (patient && !resolvedPatientName) {
    const result = await getPatient(patient);
    if (result.data) {
      resolvedPatientName = result.data.name;
    }
  }

  // Determine the back link for the page header.
  // Priority: explicit back param → patient profile → global follow-ups list
  const backHref = back
    ? back
    : patient
      ? `/dentist/patients/${patient}?tab=follow-ups`
      : "/dentist/follow-ups";

  // The success redirect after form submission mirrors the header back link.
  const successRedirect = back
    ?? (patient ? `/dentist/patients/${patient}?tab=follow-ups` : "/dentist/follow-ups");

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="New Follow-Up"
        backHref={backHref}
      />

      <FollowUpForm
        patientId={patient}
        patientName={resolvedPatientName}
        appointmentId={appointment}
        treatmentId={treatment}
        role="dentist"
        successRedirect={successRedirect}
        hideRelatedFields={!!appointment}
      />
    </div>
  );
}

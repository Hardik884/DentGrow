import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientForm } from "@/components/shared/PatientForm";

export const metadata: Metadata = {
  title: "New Patient",
};

/**
 * /dentist/patients/new
 *
 * Create patient form — dentist role.
 * PatientForm submits to actions/patients.ts → createPatient().
 * On success redirects to the new patient's profile page.
 */
export default function DentistNewPatientPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="New Patient" backHref="/dentist/patients" />
      <PatientForm
        successRedirect="/dentist/patients"
        cancelHref="/dentist/patients"
      />
    </div>
  );
}


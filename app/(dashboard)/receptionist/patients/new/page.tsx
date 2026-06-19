import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientForm } from "@/components/shared/PatientForm";

export const metadata: Metadata = {
  title: "New Patient — DentGrow",
};

/**
 * /receptionist/patients/new
 *
 * Create patient form — receptionist role.
 * Same PatientForm as dentist — role enforcement is server-side.
 * On success redirects to the patients list.
 */
export default function ReceptionistNewPatientPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="New Patient" backHref="/receptionist/patients" />
      <PatientForm
        successRedirect="/receptionist/patients"
        cancelHref="/receptionist/patients"
      />
    </div>
  );
}


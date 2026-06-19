import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentForm } from "@/components/shared/AppointmentForm";

export const metadata: Metadata = {
  title: "New Appointment — DentGrow",
};

/**
 * /receptionist/appointments/new
 *
 * Book appointment form — receptionist path.
 * Same AppointmentForm as dentist — role enforcement is server-side.
 */
export default function ReceptionistNewAppointmentPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="New Appointment" backHref="/receptionist/appointments" />
      <AppointmentForm
        successRedirect="/receptionist/appointments"
        cancelHref="/receptionist/appointments"
      />
    </div>
  );
}

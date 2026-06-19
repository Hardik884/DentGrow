import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentForm } from "@/components/shared/AppointmentForm";

export const metadata: Metadata = {
  title: "New Appointment — DentGrow",
};

/**
 * /dentist/appointments/new
 *
 * Book appointment form — dentist path.
 * Patient selector + slot picker + source + notes.
 * Submits to: actions/appointments.ts → createAppointment()
 */
export default function DentistNewAppointmentPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="New Appointment" backHref="/dentist/appointments" />
      <AppointmentForm
        successRedirect="/dentist/appointments"
        cancelHref="/dentist/appointments"
      />
    </div>
  );
}

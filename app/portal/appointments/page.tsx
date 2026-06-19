import type { Metadata } from "next";
import { AppointmentList } from "@/components/patient/AppointmentList";

export const metadata: Metadata = {
  title: "My Appointments — DentGrow",
};

/**
 * /portal/appointments
 * Upcoming appointments — patient view.
 * Shows only the authenticated patient's own appointments.
 * Cancel button available for future (non-terminal status) appointments.
 */
export default async function PortalAppointmentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Appointments</h1>
        <a
          href="/portal/appointments/new"
          className="text-sm font-medium text-blue-600"
        >
          Book Appointment
        </a>
      </div>

      <AppointmentList />
    </div>
  );
}

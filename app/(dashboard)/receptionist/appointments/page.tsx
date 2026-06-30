import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TodayAppointmentList } from "@/components/receptionist/TodayAppointmentList";
import { NewInquiryButton } from "@/components/dentist/NewInquiryButton";

export const metadata: Metadata = {
  title: "Appointments — DentGrow",
};

/**
 * /receptionist/appointments
 * Today's appointment list — receptionist view.
 * Primary operational view showing all of today's bookings with status badges.
 */
export default async function ReceptionistAppointmentsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Appointments"
        action={{ label: "Book New Appointment", href: "/receptionist/appointments/new" }}
      >
        <NewInquiryButton />
      </PageHeader>
      <TodayAppointmentList />
    </div>
  );
}


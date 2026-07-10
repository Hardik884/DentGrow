import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TodayAppointmentList } from "@/components/receptionist/TodayAppointmentList";
import { NewInquiryButton } from "@/components/dentist/NewInquiryButton";
import { AppointmentFormDialog } from "@/components/shared/AppointmentFormDialog";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Appointments",
};

/**
 * /receptionist/appointments
 * Today's appointment list — receptionist view.
 * Primary operational view showing all of today's bookings with status badges.
 */
export default async function ReceptionistAppointmentsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Appointments">
        <NewInquiryButton />
        <AppointmentFormDialog title="Book New Appointment" triggerVariant="default">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Book New Appointment
        </AppointmentFormDialog>
      </PageHeader>
      <TodayAppointmentList />
    </div>
  );
}


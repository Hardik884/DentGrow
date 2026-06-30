import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentForm } from "@/components/shared/AppointmentForm";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "New Appointment — DentGrow",
};

/**
 * /dentist/appointments/new
 *
 * Book appointment form — dentist path.
 * Fetches clinic timezone server-side and passes it to AppointmentForm
 * so the date picker min and slot generation use the clinic's local calendar.
 */
export default async function DentistNewAppointmentPage() {
  // Request-scoped cached timezone — shares auth/profile/settings with the rest
  // of the render instead of issuing its own getUser + profile + settings chain.
  const tz = await getClinicTimezone();
  const clinicToday: string | undefined = getTodayInTimezone(tz);

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <PageHeader title="New Appointment" backHref="/dentist/appointments" />
      <AppointmentForm
        successRedirect="/dentist/appointments"
        cancelHref="/dentist/appointments"
        clinicToday={clinicToday}
      />
    </div>
  );
}


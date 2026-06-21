import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentForm } from "@/components/shared/AppointmentForm";

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
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const { data: { user } } = await supabase.auth.getUser();

  let clinicToday: string | undefined;
  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id")
      .eq("id", user.id)
      .single();

    const clinicId = (profile as { clinic_id: string } | null)?.clinic_id;
    if (clinicId) {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();

      const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      clinicToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

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


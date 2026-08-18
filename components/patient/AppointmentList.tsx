import Link from "next/link";
import { getAppointments } from "@/actions/appointments";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/supabase/server";
import { isPatientBookingEnabled } from "@/lib/feature-flags";

interface AppointmentListProps {
  limit?: number;
  /** "upcoming" (default) — still scheduled. "past" — every terminal status
   * (audit B10). */
  scope?: "upcoming" | "past";
}

const PAST_STATUSES = ["completed", "cancelled", "no_show"] as const;

export async function AppointmentList({ limit, scope = "upcoming" }: AppointmentListProps) {
  const result = await getAppointments({
    status: scope === "past" ? [...PAST_STATUSES] : "scheduled",
    limit: limit ?? 10,
  });
  const appointments = result.data?.appointments ?? [];
  const bookingEnabled = isPatientBookingEnabled();

  // Resolve clinic timezone for correct time display in the portal.
  // Appointments are stored in UTC; we must display in the clinic's local timezone.
  let clinicTimezone = "Asia/Kolkata"; // safe IST default for this MVP
  try {
    const supabase = await createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db: any = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: linkData } = await db
        .from("patient_portal_links")
        .select("patient_id, patients!inner(clinic_id)")
        .eq("user_id", user.id)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clinicId = (linkData as any)?.patients?.clinic_id as string | undefined;
      if (clinicId) {
        const { data: settings } = await db
          .from("clinic_settings")
          .select("timezone")
          .eq("clinic_id", clinicId)
          .maybeSingle();
        clinicTimezone = (settings as { timezone?: string } | null)?.timezone ?? clinicTimezone;
      }
    }
  } catch {
    // Non-fatal — fall back to default timezone
  }

  return (
    <div>
      {appointments.length === 0 ? (
        <div className="bg-white border border-[#E3E9E6] rounded-xl">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            title={scope === "past" ? "No past appointments" : "No upcoming appointments"}
            description={
              scope === "past"
                ? "Your completed and cancelled appointments will appear here."
                : bookingEnabled
                  ? "You don't have any appointments scheduled."
                  : "You don't have any appointments scheduled. Please contact your clinic to book one."
            }
            action={
              scope === "upcoming" && bookingEnabled ? (
                <Button asChild size="sm">
                  <Link href="/portal/appointments/new">Book Now</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden divide-y divide-[#EEF2F0]">
          {appointments.map((appointment) => (
            <Link key={appointment.id} href={`/portal/appointments/${appointment.id}`}>
              <AppointmentCard
                appointment={appointment}
                portalView
                timezone={clinicTimezone}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { getAppointmentsToday } from "@/actions/appointments";
import { getClinicSettings } from "@/actions/clinic-settings";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";

interface UpcomingAppointmentsProps {
  /**
   * Pre-resolved clinic timezone from the parent page.
   * When provided, skips the getClinicSettings() call entirely.
   */
  timezone?: string;
}

/**
 * UpcomingAppointments — upcoming appointments for the dentist dashboard.
 */
export async function UpcomingAppointments({ timezone: propTimezone }: UpcomingAppointmentsProps = {}) {
  // If timezone was pre-resolved by the parent page, skip the settings fetch.
  const [result, clinicTimezone] = await (async () => {
    if (propTimezone) {
      const r = await getAppointmentsToday();
      return [r, propTimezone] as const;
    }
    const [r, settingsResult] = await Promise.all([
      getAppointmentsToday(),
      getClinicSettings(),
    ]);
    return [r, settingsResult.data?.timezone ?? "Asia/Kolkata"] as const;
  })();

  const appointments = (result.data ?? []).filter(
    (a) => a.status === "scheduled" || a.status === "checked_in"
  );

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#09090B]">Upcoming Today</h2>
          <p className="text-xs text-[#71717A] mt-0.5">
            {appointments.length} appointment{appointments.length !== 1 ? "s" : ""} remaining
          </p>
        </div>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
          title="All clear"
          description="No upcoming appointments for today."
        />
      ) : (
        <div className="divide-y divide-[#F4F4F5]">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              baseHref="/dentist"
              timezone={clinicTimezone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

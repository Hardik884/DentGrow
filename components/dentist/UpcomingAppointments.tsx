import { getAppointmentsToday } from "@/actions/appointments";
import { getClinicSettings } from "@/actions/clinic-settings";
import { AppointmentQuickActions } from "@/components/dentist/AppointmentQuickActions";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTimeInTimezone } from "@/lib/utils";
import { CalendarDays, Clock } from "lucide-react";
import type { AppointmentStatus } from "@/types";

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

  const clinicToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Upcoming Today</h2>
          <p className="text-xs text-text-secondary mt-0.5">
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
        <div className="divide-y divide-surface-muted">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="px-5 py-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                <PatientAvatar name={appointment.patient.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {appointment.patient.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock className="h-3 w-3 text-text-disabled shrink-0" aria-hidden />
                    <p className="text-xs text-text-secondary">
                      {formatDateTimeInTimezone(appointment.scheduled_at, clinicTimezone)}
                      {" · "}
                      {appointment.duration_minutes} min
                    </p>
                  </div>
                </div>
                <AppointmentStatusBadge status={appointment.status as AppointmentStatus} />
              </div>

              <AppointmentQuickActions
                appointmentId={appointment.id}
                patientId={appointment.patient_id}
                patientName={appointment.patient.name}
                baseHref="/dentist"
                currentStatus={appointment.status as AppointmentStatus}
                currentScheduledAt={appointment.scheduled_at}
                clinicToday={clinicToday}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

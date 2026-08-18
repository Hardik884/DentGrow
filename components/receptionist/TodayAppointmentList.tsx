import { getAppointmentsToday } from "@/actions/appointments";
import { getClinicSettings } from "@/actions/clinic-settings";
import { TodayAppointmentListWithActions } from "@/components/receptionist/TodayAppointmentListWithActions";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";

export async function TodayAppointmentList() {
  const [result, settingsResult] = await Promise.all([
    getAppointmentsToday(),
    getClinicSettings(),
  ]);
  const appointments = result.data ?? [];
  const clinicTimezone = settingsResult.data?.timezone ?? "Asia/Kolkata";

  // Get clinic today for reschedule date validation
  const clinicToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-text-primary">Today&apos;s Appointments</h2>
        <p className="text-xs text-text-secondary mt-0.5">
          {appointments.length} appointment{appointments.length !== 1 ? "s" : ""} today
        </p>
      </div>

      {appointments.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
          title="No appointments today"
          description="Today's schedule is clear."
        />
      ) : (
        <TodayAppointmentListWithActions
          appointments={appointments}
          timezone={clinicTimezone}
          clinicToday={clinicToday}
        />
      )}
    </div>
  );
}

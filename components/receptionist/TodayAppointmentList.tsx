import { getAppointmentsToday } from "@/actions/appointments";
import { getClinicSettings } from "@/actions/clinic-settings";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";

export async function TodayAppointmentList() {
  const [result, settingsResult] = await Promise.all([
    getAppointmentsToday(),
    getClinicSettings(),
  ]);
  const appointments = result.data ?? [];
  const clinicTimezone = settingsResult.data?.timezone ?? "Asia/Kolkata";

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E4E4E7]">
        <h2 className="text-sm font-semibold text-[#09090B]">Today&apos;s Appointments</h2>
        <p className="text-xs text-[#71717A] mt-0.5">
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
        <div className="divide-y divide-[#F4F4F5]">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              baseHref="/receptionist"
              timezone={clinicTimezone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

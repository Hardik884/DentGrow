import { getAppointmentsToday } from "@/actions/appointments";
import { AppointmentCard } from "@/components/shared/AppointmentCard";

/**
 * TodayAppointmentList
 *
 * Server Component — full list of today's appointments for receptionist dashboard.
 * Includes all statuses with status badges.
 */
export async function TodayAppointmentList() {
  const result = await getAppointmentsToday();
  const appointments = result.data ?? [];

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Today&apos;s Appointments</h2>

      {appointments.length === 0 ? (
        <p className="text-sm text-gray-500">No appointments today.</p>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      )}
    </div>
  );
}

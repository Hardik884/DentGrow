import { getAppointmentsToday } from "@/actions/appointments";
import { AppointmentCard } from "@/components/shared/AppointmentCard";

/**
 * UpcomingAppointments
 *
 * Server Component — list of upcoming appointments for the dentist dashboard.
 * Shows appointments with status = 'scheduled' or 'checked_in', ordered by time.
 */
export async function UpcomingAppointments() {
  const result = await getAppointmentsToday();
  const appointments = (result.data ?? []).filter(
    (a) => a.status === "scheduled" || a.status === "checked_in"
  );

  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="font-semibold text-gray-900 mb-3">Upcoming Appointments</h2>

      {appointments.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming appointments today.</p>
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

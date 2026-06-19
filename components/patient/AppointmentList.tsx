import Link from "next/link";
import { getAppointments } from "@/actions/appointments";
import { AppointmentCard } from "@/components/shared/AppointmentCard";

interface AppointmentListProps {
  limit?: number;
}

/**
 * AppointmentList
 *
 * Patient portal — upcoming appointments list.
 * Shows only this patient's own appointments (enforced by RLS).
 * portalView=true on each card to hide staff-only fields.
 */
export async function AppointmentList({ limit }: AppointmentListProps) {
  const result = await getAppointments({
    status: "scheduled",
    limit: limit ?? 10,
  });

  const appointments = result.data?.appointments ?? [];

  return (
    <div className="space-y-3">
      {appointments.length === 0 ? (
        <div className="border rounded-lg p-4 text-sm text-gray-500 text-center">
          No upcoming appointments.{" "}
          <Link href="/portal/appointments/new" className="text-blue-600">
            Book one now
          </Link>
        </div>
      ) : (
        appointments.map((appointment) => (
          <Link
            key={appointment.id}
            href={`/portal/appointments/${appointment.id}`}
          >
            <AppointmentCard appointment={appointment} portalView />
          </Link>
        ))
      )}
    </div>
  );
}

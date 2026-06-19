import Link from "next/link";
import { getAppointments } from "@/actions/appointments";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppointmentListProps {
  limit?: number;
}

export async function AppointmentList({ limit }: AppointmentListProps) {
  const result = await getAppointments({ status: "scheduled", limit: limit ?? 10 });
  const appointments = result.data?.appointments ?? [];

  return (
    <div>
      {appointments.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            title="No upcoming appointments"
            description="You don't have any appointments scheduled."
            action={
              <Button asChild size="sm">
                <Link href="/portal/appointments/new">Book Now</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
          {appointments.map((appointment) => (
            <Link key={appointment.id} href={`/portal/appointments/${appointment.id}`}>
              <AppointmentCard appointment={appointment} portalView />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

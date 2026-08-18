import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/components/patient/AppointmentList";
import { isPatientBookingEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Appointments",
};

/**
 * /portal/appointments
 *
 * Upcoming AND past appointments — patient view (audit B10). Shows only the
 * authenticated patient's own appointments, via a plain link-based tab (no
 * new client-state pattern) so the choice survives a refresh/share like every
 * other portal filter. Cancel button available for future (non-terminal
 * status) appointments — unaffected, since that lives on the detail page.
 */
export default async function PortalAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const scope = tab === "past" ? "past" : "upcoming";
  const bookingEnabled = isPatientBookingEnabled();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">My Appointments</h1>
        {bookingEnabled && (
          <Link
            href="/portal/appointments/new"
            className="text-sm font-medium text-blue-600"
          >
            Book Appointment
          </Link>
        )}
      </div>

      <div className="flex gap-1 border-b border-[#E3E9E6]">
        <TabLink href="/portal/appointments" active={scope === "upcoming"}>
          Upcoming
        </TabLink>
        <TabLink href="/portal/appointments?tab=past" active={scope === "past"}>
          Past
        </TabLink>
      </div>

      <AppointmentList scope={scope} />
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-2 text-sm font-medium border-b-2 -mb-px",
        active
          ? "border-[#151918] text-[#151918]"
          : "border-transparent text-[#737A76] hover:text-[#151918]",
      )}
    >
      {children}
    </Link>
  );
}

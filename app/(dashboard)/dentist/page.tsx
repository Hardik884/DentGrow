import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { DashboardKPIs } from "@/components/dentist/DashboardKPIs";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { UpcomingAppointments } from "@/components/dentist/UpcomingAppointments";
import { ClinicDentistName } from "@/components/shared/ClinicDentistName";
import { getTodayQueue } from "@/actions/queue";
import { getClinicConfig } from "@/lib/clinic/config";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DentistDashboardPage() {
  // clinicId + timezone come from the request-scoped cached resolvers
  // (getClinicConfig → resolveSession). getTodayQueue reuses the same cached
  // session, so auth + profile are resolved once for the whole render — not
  // once per data source. clinicId/timezone are passed down so child
  // components fire no further auth/profile/settings lookups.
  const [{ clinicId, timezone }, queueRes] = await Promise.all([
    getClinicConfig(),
    getTodayQueue(),
  ]);

  if (clinicId) {
    const initialQueue = queueRes.data ?? [];

    return (
      <div className="p-6 max-w-screen-xl">
        <PageHeader
          title="Today's Dashboard"
          description="Overview of today's clinic activity"
          action={{ label: "Book New Appointment", href: "/dentist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
        />

        {/* Clinic dentist name (data-driven from clinics.dentist_name) */}
        <ClinicDentistName />

        {/* KPI Cards — receives pre-resolved clinicId + timezone, fires no extra queries */}
        <DashboardKPIs clinicId={clinicId} timezone={timezone} />

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <div className="lg:col-span-2 space-y-4">
            <UpcomingAppointments timezone={timezone} />
          </div>

          <div className="space-y-4">
            <QueueWidget
              initialQueue={initialQueue}
              clinicId={clinicId}
              queueHref="/dentist/queue"
            />
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unauthenticated (middleware handles redirect, but be defensive)
  const queueResult = queueRes;
  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Today's Dashboard"
        description="Overview of today's clinic activity"
        action={{ label: "Book New Appointment", href: "/dentist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
      />
      <DashboardKPIs />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          <UpcomingAppointments />
        </div>
        <div className="space-y-4">
          <QueueWidget
            initialQueue={queueResult.data ?? []}
            clinicId={clinicId}
            queueHref="/dentist/queue"
          />
        </div>
      </div>
    </div>
  );
}

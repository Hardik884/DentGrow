import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layouts/PageHeader";
import { DashboardKPIs } from "@/components/dentist/DashboardKPIs";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { UpcomingAppointments } from "@/components/dentist/UpcomingAppointments";
import { ClinicDentistName } from "@/components/shared/ClinicDentistName";
import { getTodayQueue } from "@/actions/queue";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DentistDashboardPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  // Resolve auth + profile + timezone + queue in parallel — single set of DB hits.
  // clinicId and timezone are passed down to child components so they don't
  // each fire their own redundant auth/profile/settings lookups.
  const { data: { user } } = await supabase.auth.getUser();

  let clinicId = "";
  let timezone = "Asia/Kolkata";

  if (user) {
    // Fetch profile and clinic settings in parallel
    const [profileRes, queueRes] = await Promise.all([
      db.from("profiles").select("clinic_id").eq("id", user.id).single(),
      getTodayQueue(),
    ]);

    clinicId = (profileRes.data as { clinic_id: string } | null)?.clinic_id ?? "";

    // Fetch timezone only if we have a clinicId
    if (clinicId) {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      timezone = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
    }

    const initialQueue = queueRes.data ?? [];

    return (
      <div className="p-6 max-w-screen-xl">
        <PageHeader
          title="Dashboard"
          description="Overview of today's clinic activity"
          action={{ label: "New Appointment", href: "/dentist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
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
  const queueResult = await getTodayQueue();
  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Dashboard"
        description="Overview of today's clinic activity"
        action={{ label: "New Appointment", href: "/dentist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
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

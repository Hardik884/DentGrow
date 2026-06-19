import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { DashboardKPIs } from "@/components/dentist/DashboardKPIs";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { InsightsPanel } from "@/components/ai/InsightsPanel";
import { UpcomingAppointments } from "@/components/dentist/UpcomingAppointments";
import { getTodayQueue } from "@/actions/queue";
import { createServerClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DentistDashboardPage() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicId = "";
  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id")
      .eq("id", user.id)
      .single();
    clinicId = (profile as { clinic_id: string } | null)?.clinic_id ?? "";
  }

  const queueResult = await getTodayQueue();
  const initialQueue = queueResult.data ?? [];

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Dashboard"
        description="Overview of today's clinic activity"
        action={{ label: "New Appointment", href: "/dentist/appointments/new", icon: <Plus className="h-3.5 w-3.5" /> }}
      />

      {/* KPI Cards */}
      <DashboardKPIs />

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="lg:col-span-2 space-y-4">
          <UpcomingAppointments />
        </div>

        <div className="space-y-4">
          <QueueWidget
            initialQueue={initialQueue}
            clinicId={clinicId}
            queueHref="/dentist/queue"
          />
          <InsightsPanel />
        </div>
      </div>
    </div>
  );
}


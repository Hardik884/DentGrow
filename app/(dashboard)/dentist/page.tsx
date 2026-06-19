import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { DashboardKPIs } from "@/components/dentist/DashboardKPIs";
import { QueueWidget } from "@/components/queue/QueueWidget";
import { InsightsPanel } from "@/components/ai/InsightsPanel";
import { UpcomingAppointments } from "@/components/dentist/UpcomingAppointments";

export const metadata: Metadata = {
  title: "Dashboard — DentGrow",
};

/**
 * /dentist
 * Dentist dashboard — primary landing page after login.
 *
 * Displays:
 * - Today's KPI cards (appointments, revenue, no-shows, new patients, walk-ins)
 * - Live queue widget (current + next patient)
 * - Upcoming appointments list
 * - AI Insights panel (non-blocking — rendered independently)
 */
export default async function DentistDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Dashboard" />

      {/* KPI metric cards — today scoped */}
      <DashboardKPIs />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Upcoming appointments requiring action */}
          <UpcomingAppointments />
        </div>

        <div className="space-y-6">
          {/* Live queue widget — current + next patient */}
          <QueueWidget />

          {/* AI Insights — non-blocking, fails gracefully */}
          <InsightsPanel />
        </div>
      </div>
    </div>
  );
}

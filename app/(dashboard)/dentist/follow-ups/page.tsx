import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpDashboard } from "@/components/follow-ups/FollowUpDashboard";

export const metadata: Metadata = {
  title: "Follow-Ups — DentGrow",
};

/**
 * /dentist/follow-ups
 *
 * Clinic-wide follow-up dashboard — dentist role.
 *
 * Shows:
 * - KPI cards: pending, overdue, upcoming, completed
 * - Overdue follow-ups (highlighted first)
 * - Upcoming follow-ups
 * - Recently completed follow-ups
 */
export default async function DentistFollowUpsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Follow-Ups"
        action={{ label: "+ New Follow-Up", href: "/dentist/follow-ups/new" }}
      />
      <FollowUpDashboard />
    </div>
  );
}


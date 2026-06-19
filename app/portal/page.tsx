import type { Metadata } from "next";
import { PortalDashboard } from "@/components/patient/PortalDashboard";

export const metadata: Metadata = {
  title: "My Dashboard — DentGrow",
};

/**
 * /portal
 * Patient dashboard — simplified self-service view.
 *
 * Displays:
 * - Outstanding balance
 * - Live queue position + estimated wait time (if checked in today)
 * - Upcoming appointments
 * - Pending follow-ups (overdue highlighted)
 * - Recent treatments
 * - Quick-nav links
 *
 * All data is resolved inside PortalDashboard (server component).
 */
export default function PortalDashboardPage() {
  return <PortalDashboard />;
}


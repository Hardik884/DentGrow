import { redirect } from "next/navigation";

/**
 * Redirects to the unified analytics dashboard.
 * All analytics live at /dentist/analytics.
 */
export default function AppointmentAnalyticsPage() {
  redirect("/dentist/analytics");
}

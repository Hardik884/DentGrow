import { redirect } from "next/navigation";

/**
 * /dentist/settings/availability
 *
 * This page has been removed. Availability configuration is now part of
 * Clinic Settings → Clinic Hours, which is the single source of truth
 * for appointment slot generation.
 *
 * Redirect to the consolidated settings page.
 */
export default function AvailabilityRulesPage() {
  redirect("/dentist/settings");
}

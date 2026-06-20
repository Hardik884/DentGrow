import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { ClinicSettingsForm } from "@/components/dentist/ClinicSettingsForm";
import { getClinicSettings } from "@/actions/clinic-settings";

export const metadata: Metadata = {
  title: "Clinic Settings — DentGrow",
};

/**
 * /dentist/settings
 *
 * Clinic settings form — dentist role only.
 * Edits clinic_name, phone, email, address, clinic_hours,
 * average_appointment_duration, timezone.
 *
 * Clinic Hours is the source of truth for:
 *   - Available slot generation (closed days = no slots)
 *   - Queue wait-time calculations
 *   - Patient AI Assistant clinic information
 *
 * Submits to actions/clinic-settings.ts → updateClinicSettings()
 */
export default async function ClinicSettingsPage() {
  const { data: settings } = await getClinicSettings();

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Clinic Settings" />
      <ClinicSettingsForm initialSettings={settings} />
    </div>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";

export const metadata: Metadata = {
  title: "Clinic Settings — DentGrow",
};

/**
 * /dentist/settings
 * Clinic settings form — dentist role only.
 * Edits clinic_name, phone, email, address, clinic_hours, average_appointment_duration, timezone.
 * Submits to actions/clinic-settings.ts → updateClinicSettings()
 */
export default async function ClinicSettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Clinic Settings"
        action={{ label: "Availability Rules", href: "/dentist/settings/availability" }}
      />
      {/* TODO: ClinicSettingsForm (react-hook-form + UpdateClinicSettingsSchema) */}
    </div>
  );
}

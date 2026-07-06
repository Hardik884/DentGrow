import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { ClinicSettingsForm } from "@/components/dentist/ClinicSettingsForm";
import { SignatureSettings } from "@/components/dentist/SignatureSettings";
import { ConsultantSettings } from "@/components/dentist/ConsultantSettings";
import { getClinicSettings } from "@/actions/clinic-settings";
import { getMySignature } from "@/actions/signature";
import {
  getConsultants,
  getConsultancySchedules,
  getUnavailableDates,
} from "@/actions/consultants";

export const metadata: Metadata = {
  title: "Clinic Settings",
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
 *
 * Also hosts the Digital Signature section: the dentist uploads their signature
 * once here and it is automatically applied to every completed treatment shown
 * to patients (actions/signature.ts).
 */
export default async function ClinicSettingsPage() {
  const [
    { data: settings },
    { data: signature },
    { data: consultants },
    { data: schedules },
    { data: unavailableDates },
  ] = await Promise.all([
    getClinicSettings(),
    getMySignature(),
    getConsultants(),
    getConsultancySchedules(),
    getUnavailableDates(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Clinic Settings" />
      <ClinicSettingsForm initialSettings={settings} />
      <ConsultantSettings
        initialConsultants={consultants ?? []}
        initialSchedules={schedules ?? []}
        initialUnavailableDates={unavailableDates ?? []}
      />
      <SignatureSettings initialUrl={signature?.url ?? null} />
    </div>
  );
}

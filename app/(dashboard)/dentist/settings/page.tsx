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

      {/* Patient Consent Forms is a per-clinic pilot rollout — hidden entirely
          for a clinic that doesn't have consent_forms_enabled set. */}
      {settings?.consent_forms_enabled === true && (
        <a
          href="/dentist/settings/consent-templates"
          className="flex items-center justify-between rounded-xl border border-[#E3E9E6] bg-white px-5 py-4 hover:border-[#CBD5D0] transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-[#151918]">Consent Templates</p>
            <p className="text-xs text-[#737A76] mt-0.5">
              Review and edit your clinic&apos;s informed-consent templates (versioned).
            </p>
          </div>
          <span className="text-sm text-[#2563EB] font-medium">Manage →</span>
        </a>
      )}
    </div>
  );
}

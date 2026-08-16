import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientProfileHeader } from "@/components/dentist/PatientProfileHeader";
import { OutstandingBalanceBadge } from "@/components/shared/OutstandingBalanceBadge";
import { PatientFollowUpsTab } from "@/components/follow-ups/PatientFollowUpsTab";
import { PatientTreatmentsTab } from "@/components/dentist/PatientTreatmentsTab";
import { BillingPaymentsTab } from "@/components/billing/BillingPaymentsTab";
import { PatientConsentFormsTab } from "@/components/consent/PatientConsentFormsTab";
import { getClinicSettings } from "@/actions/clinic-settings";

export const metadata: Metadata = {
  title: "Patient",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "overview" | "treatments" | "payments" | "follow-ups" | "consent-forms";

/**
 * /receptionist/patients/[id]
 *
 * Patient profile — receptionist / operational view.
 * Tabs: Overview | Follow-Ups | Treatments (no internal_notes) | Billing & Payments
 *
 * PatientProfileHeader receives role="receptionist" which suppresses
 * the delete button and notes field.
 * Receptionist can view follow-ups but cannot mark complete/cancel.
 */
export default async function ReceptionistPatientProfilePage({ params, searchParams }: Props) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);

  if (!id) notFound();

  const clinicSettingsResult = await getClinicSettings();
  // Patient Consent Forms is a per-clinic pilot rollout — the tab is hidden
  // entirely (not just empty) for a clinic that doesn't have it enabled yet.
  const consentFormsEnabled = clinicSettingsResult.data?.consent_forms_enabled === true;

  const rawTabIsValid =
    rawTab === "treatments" ||
    rawTab === "payments" ||
    rawTab === "follow-ups" ||
    (rawTab === "consent-forms" && consentFormsEnabled);
  const tab: Tab = rawTabIsValid ? (rawTab as Tab) : "overview";

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Patient" backHref="/receptionist/patients" />

      {/* Demographics + stats + edit button (no delete for receptionist) */}
      <PatientProfileHeader
        patientId={id}
        role="receptionist"
        baseHref="/receptionist"
      />

      {/* Tab navigation */}
      <div className="border-b flex gap-0">
        <TabLink href={`/receptionist/patients/${id}`} active={tab === "overview"}>
          Overview
        </TabLink>
        <TabLink href={`/receptionist/patients/${id}?tab=follow-ups`} active={tab === "follow-ups"}>
          Follow-Ups
        </TabLink>
        <TabLink href={`/receptionist/patients/${id}?tab=treatments`} active={tab === "treatments"}>
          Treatments
        </TabLink>
        <TabLink href={`/receptionist/patients/${id}?tab=payments`} active={tab === "payments"}>
          Billing &amp; Payments
        </TabLink>
        {consentFormsEnabled && (
          <TabLink href={`/receptionist/patients/${id}?tab=consent-forms`} active={tab === "consent-forms"}>
            Consent Forms
          </TabLink>
        )}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <PatientFollowUpsTab
              patientId={id}
              baseHref="/receptionist"
              role="receptionist"
            />
          </div>
          <div className="space-y-6">
            <OutstandingBalanceBadge patientId={id} />
          </div>
        </div>
      )}

      {tab === "follow-ups" && (
        <PatientFollowUpsTab
          patientId={id}
          baseHref="/receptionist"
          role="receptionist"
        />
      )}

      {tab === "treatments" && (
        <PatientTreatmentsTab
          patientId={id}
          role="receptionist"
          baseHref="/receptionist"
        />
      )}

      {tab === "payments" && (
        <BillingPaymentsTab
          patientId={id}
          role="receptionist"
          baseHref="/receptionist"
        />
      )}

      {tab === "consent-forms" && (
        <PatientConsentFormsTab patientId={id} role="receptionist" baseHref="/receptionist" />
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
    </a>
  );
}

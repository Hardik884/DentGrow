import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientProfileHeader } from "@/components/dentist/PatientProfileHeader";
import { OutstandingBalanceBadge } from "@/components/shared/OutstandingBalanceBadge";
import { PatientFollowUpsTab } from "@/components/follow-ups/PatientFollowUpsTab";
import { PatientTreatmentsTab } from "@/components/dentist/PatientTreatmentsTab";
import { PatientPaymentsTab } from "@/components/dentist/PatientPaymentsTab";

export const metadata: Metadata = {
  title: "Patient",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "overview" | "treatments" | "payments" | "follow-ups";

/**
 * /receptionist/patients/[id]
 *
 * Patient profile — receptionist / operational view.
 * Tabs: Overview | Follow-Ups | Treatments (no internal_notes) | Payments
 *
 * PatientProfileHeader receives role="receptionist" which suppresses
 * the delete button and notes field.
 * Receptionist can view follow-ups but cannot mark complete/cancel.
 */
export default async function ReceptionistPatientProfilePage({ params, searchParams }: Props) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);

  if (!id) notFound();

  const tab: Tab =
    rawTab === "treatments" || rawTab === "payments" || rawTab === "follow-ups"
      ? rawTab
      : "overview";

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
          Payments
        </TabLink>
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
        <PatientPaymentsTab
          patientId={id}
          role="receptionist"
          baseHref="/receptionist"
        />
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

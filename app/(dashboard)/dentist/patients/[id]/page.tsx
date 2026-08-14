import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientProfileHeader } from "@/components/dentist/PatientProfileHeader";
import { PatientSummaryCard } from "@/components/ai/PatientSummaryCard";
import { PatientFollowUpsTab } from "@/components/follow-ups/PatientFollowUpsTab";
import { PatientTreatmentsTab } from "@/components/dentist/PatientTreatmentsTab";
import { PatientPaymentsTab } from "@/components/dentist/PatientPaymentsTab";
import { PatientDentalChartSection } from "@/components/dental-chart/PatientDentalChartSection";
import { getPatient } from "@/actions/patients";

export const metadata: Metadata = {
  title: "Patient Profile",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

type Tab = "overview" | "dental-chart" | "treatments" | "payments" | "follow-ups";

/**
 * /dentist/patients/[id]
 *
 * Full patient profile — dentist view.
 * Tabs: Overview (AI summary) | Dental Chart | Follow-Ups | Treatments | Payments
 */
export default async function DentistPatientProfilePage({ params, searchParams }: Props) {
  const [{ id }, { tab: rawTab }] = await Promise.all([params, searchParams]);

  if (!id) notFound();

  // Fetch patient name for use in "New Follow-Up" links so the form can
  // pre-populate the selected-patient chip without a client round-trip.
  const patientResult = await getPatient(id);
  const patientName = patientResult.data?.name;

  const tab: Tab =
    rawTab === "dental-chart" || rawTab === "treatments" || rawTab === "payments" || rawTab === "follow-ups"
      ? rawTab
      : "overview";

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Patient Profile" backHref="/dentist/patients" />

      {/* Demographics, stats, balance, actions */}
      <PatientProfileHeader
        patientId={id}
        role="dentist"
        baseHref="/dentist"
      />

      {/* Tab navigation */}
      <div className="border-b flex gap-0">
        <TabLink href={`/dentist/patients/${id}`} active={tab === "overview"}>
          Overview
        </TabLink>
        <TabLink href={`/dentist/patients/${id}?tab=dental-chart`} active={tab === "dental-chart"}>
          Dental Chart
        </TabLink>
        <TabLink href={`/dentist/patients/${id}?tab=follow-ups`} active={tab === "follow-ups"}>
          Follow-Ups
        </TabLink>
        <TabLink href={`/dentist/patients/${id}?tab=treatments`} active={tab === "treatments"}>
          Treatments
        </TabLink>
        <TabLink href={`/dentist/patients/${id}?tab=payments`} active={tab === "payments"}>
          Payments
        </TabLink>
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Quick follow-up summary on overview */}
            <PatientFollowUpsTab
              patientId={id}
              patientName={patientName}
              baseHref="/dentist"
              role="dentist"
            />
          </div>
          <div className="space-y-6">
            {/* AI Patient Summary — non-blocking, fails gracefully */}
            <PatientSummaryCard patientId={id} />
          </div>
        </div>
      )}

      {tab === "dental-chart" && (
        <PatientDentalChartSection patientId={id} patientName={patientName} />
      )}

      {tab === "follow-ups" && (
        <PatientFollowUpsTab
          patientId={id}
          patientName={patientName}
          baseHref="/dentist"
          role="dentist"
        />
      )}

      {tab === "treatments" && (
        <PatientTreatmentsTab
          patientId={id}
          role="dentist"
          baseHref="/dentist"
        />
      )}

      {tab === "payments" && (
        <PatientPaymentsTab
          patientId={id}
          patientName={patientName}
          role="dentist"
          baseHref="/dentist"
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

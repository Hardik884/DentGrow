import { SegmentedTabs } from "@/components/shared/SegmentedTabs";
import { PatientBillListView } from "@/components/billing/PatientBillListView";
import { PatientPaymentsTab } from "@/components/dentist/PatientPaymentsTab";

interface BillingPaymentsTabProps {
  patientId: string;
  patientName?: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

/**
 * BillingPaymentsTab — the patient-profile "Billing & Payments" tab.
 *
 * [ Payments ] is ALWAYS the default view: the EXISTING <PatientPaymentsTab>,
 * reused unmodified — this is a navigation/container change only, per
 * CLAUDE.md §7: the existing Payments experience is not rewritten.
 * [ Bill ] is additional: one bill per billed treatment.
 */
export async function BillingPaymentsTab({
  patientId,
  patientName,
  role,
  baseHref,
}: BillingPaymentsTabProps) {
  return (
    <SegmentedTabs
      tabs={[
        { key: "payments", label: "Payments" },
        { key: "bill", label: "Bill" },
      ]}
      defaultKey="payments"
      panels={{
        payments: (
          <PatientPaymentsTab
            patientId={patientId}
            patientName={patientName}
            role={role}
            baseHref={baseHref}
          />
        ),
        bill: <PatientBillListView patientId={patientId} baseHref={baseHref} />,
      }}
    />
  );
}

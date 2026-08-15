import { SegmentedTabs } from "@/components/shared/SegmentedTabs";
import { VisitBillPreview } from "@/components/billing/VisitBillPreview";
import { AppointmentPaymentsSection } from "@/components/dentist/AppointmentPaymentsSection";

interface VisitBillingSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
  baseHref: string; // "/dentist" | "/receptionist"
}

/**
 * VisitBillingSection — "Billing & Payments" on the Patient Visit /
 * Appointment page.
 *
 * [ Payments ] is ALWAYS the default view: the EXISTING
 * <AppointmentPaymentsSection>, reused unmodified — no payment logic, UI or
 * behaviour changes here.
 * [ Bill ] is additional: a compact per-visit bill summary linking to the
 * full printable invoice.
 */
export async function VisitBillingSection({
  appointmentId,
  patientId,
  patientName,
  baseHref,
}: VisitBillingSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Billing &amp; Payments</h3>
      <SegmentedTabs
        tabs={[
          { key: "payments", label: "Payments" },
          { key: "bill", label: "Bill" },
        ]}
        defaultKey="payments"
        panels={{
          payments: (
            <AppointmentPaymentsSection
              appointmentId={appointmentId}
              patientId={patientId}
              patientName={patientName}
            />
          ),
          bill: <VisitBillPreview appointmentId={appointmentId} baseHref={baseHref} />,
        }}
      />
    </div>
  );
}

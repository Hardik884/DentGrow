import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { InvoiceDocument } from "@/components/billing/InvoiceDocument";
import { InvoiceActions } from "@/components/billing/InvoiceActions";
import { getPortalTreatmentBill } from "@/actions/billing";

export const metadata: Metadata = {
  title: "Bill",
};

interface Props {
  params: Promise<{ treatmentId: string }>;
}

const INVOICE_TARGET_ID = "invoice-document";

/**
 * /portal/billing/[treatmentId]
 *
 * One treatment's bill, for the authenticated patient only.
 * `getPortalTreatmentBill` resolves the patient strictly from the session
 * (patient_portal_links) and verifies the treatment belongs to that patient
 * before returning anything — a treatmentId for another patient 404s exactly
 * like a nonexistent one, never confirming the row exists.
 *
 * No "Send on WhatsApp" action here — that stays a staff-only tool.
 */
export default async function PortalBillPage({ params }: Props) {
  const { treatmentId } = await params;
  if (!treatmentId) notFound();

  const result = await getPortalTreatmentBill(treatmentId);
  if (!result.data) notFound();

  const doc = result.data;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/portal/billing"
          className="inline-flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors mb-1"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden />
          Back to Billing &amp; Payments
        </Link>
        <h1 className="text-xl font-semibold">Bill</h1>
      </div>

      <InvoiceActions
        targetId={INVOICE_TARGET_ID}
        fileName={`Bill-${doc.bill.invoiceNumber}.pdf`}
        patientName={doc.patient.name}
        clinicName={doc.clinic.name}
        patientPhone={doc.patient.phone}
        showWhatsApp={false}
      />

      <div className="border border-[#E4E4E7] rounded-xl overflow-hidden shadow-sm">
        <InvoiceDocument document={doc} audience="patient" timezone={doc.timezone} />
      </div>
    </div>
  );
}

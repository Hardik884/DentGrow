import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { InvoiceDocument } from "@/components/billing/InvoiceDocument";
import { InvoiceActions } from "@/components/billing/InvoiceActions";
import { getStaffBill } from "@/actions/billing";

export const metadata: Metadata = {
  title: "Bill",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ treatment?: string; from?: string }>;
}

const INVOICE_TARGET_ID = "invoice-document";

/**
 * /dentist/appointments/[id]/bill
 *
 * Full, printable bill for one visit — or, with ?treatment=<id>, for a single
 * treatment recorded on that visit. Same data path (getStaffBill), same
 * <InvoiceDocument> renderer, so a per-treatment bill and a whole-visit bill
 * are never two different documents.
 *
 * `?from` preserves the origin so Back returns where the user came from:
 *   - "billing"  → the main Billing & Payments page with the Billing view active
 *   - "patient"  → the patient profile's Billing & Payments tab
 *   - otherwise  → the visit/appointment page (the default entry point)
 */
export default async function DentistBillPage({ params, searchParams }: Props) {
  const [{ id }, { treatment, from }] = await Promise.all([params, searchParams]);
  if (!id) notFound();

  const result = await getStaffBill(id, treatment);
  if (!result.data) notFound();

  const doc = result.data;

  const backHref =
    from === "billing"
      ? "/dentist/payments?view=billing"
      : from === "patient"
        ? `/dentist/patients/${doc.patient.id}?tab=payments`
        : `/dentist/appointments/${id}`;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Bill"
        description={`Invoice ${doc.bill.invoiceNumber} · ${doc.patient.name}`}
        backHref={backHref}
      />

      <InvoiceActions
        targetId={INVOICE_TARGET_ID}
        fileName={`Bill-${doc.bill.invoiceNumber}.pdf`}
        patientName={doc.patient.name}
        clinicName={doc.clinic.name}
        patientPhone={doc.patient.phone}
        showWhatsApp
        addPhoneHref={`/dentist/patients/${doc.patient.id}/edit`}
      />

      <div className="border border-[#E4E4E7] rounded-xl overflow-hidden shadow-sm">
        <InvoiceDocument document={doc} audience="staff" timezone={doc.timezone} />
      </div>
    </div>
  );
}

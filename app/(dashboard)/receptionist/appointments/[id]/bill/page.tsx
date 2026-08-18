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
 * /receptionist/appointments/[id]/bill
 *
 * Same data path and renderer as the dentist bill page (getStaffBill +
 * <InvoiceDocument>). The signature "configure" link is omitted here — only
 * a dentist can access Clinic Settings to upload one.
 *
 * `?from` preserves the origin so Back returns where the user came from
 * (Billing page, patient profile, or the visit page) rather than always the
 * appointment page.
 */
export default async function ReceptionistBillPage({ params, searchParams }: Props) {
  const [{ id }, { treatment, from }] = await Promise.all([params, searchParams]);
  if (!id) notFound();

  const result = await getStaffBill(id, treatment);
  if (!result.data) notFound();

  const doc = result.data;

  const backHref =
    from === "billing"
      ? "/receptionist/payments?view=billing"
      : from === "patient"
        ? `/receptionist/patients/${doc.patient.id}?tab=payments`
        : `/receptionist/appointments/${id}`;

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
        addPhoneHref={`/receptionist/patients/${doc.patient.id}/edit`}
      />

      <div className="border border-border rounded-xl overflow-hidden shadow-sm">
        <InvoiceDocument document={doc} audience="staff" timezone={doc.timezone} />
      </div>
    </div>
  );
}

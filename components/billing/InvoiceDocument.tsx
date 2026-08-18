import { formatCurrency, formatDateInTimezone } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { BillDocument } from "@/actions/billing";
import type { BillStatus } from "@/lib/billing/invoice";

const STATUS_LABEL: Record<BillStatus, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  pending: "Pending",
  no_charge: "No Charge",
};

const STATUS_VARIANT: Record<BillStatus, "success" | "warning" | "danger" | "secondary"> = {
  paid: "success",
  partial: "warning",
  pending: "danger",
  no_charge: "secondary",
};

interface InvoiceDocumentProps {
  document: BillDocument;
  /** Who's viewing — kept for callers/documentation; the signature block's
   *  behaviour no longer varies by audience (see below). */
  audience: "staff" | "patient";
  timezone?: string;
  className?: string;
}

/**
 * InvoiceDocument — the ONE canonical bill/invoice renderer.
 *
 * Used, unmodified, by:
 *   - the dentist/receptionist Bill page (print + Download PDF + Send on WhatsApp)
 *   - the patient portal Bill page (print + Download PDF)
 *   - the PDF export and the WhatsApp-shared file, which both capture this
 *     exact DOM node — never a second, independently built document.
 *
 * Pure/presentational: takes an already-resolved BillDocument (all money
 * figures computed by lib/billing/invoice.ts from the canonical balance/
 * payout helpers) and renders it. No data fetching, no calculation.
 */
export function InvoiceDocument({
  document,
  audience: _audience,
  timezone = "Asia/Kolkata",
  className,
}: InvoiceDocumentProps) {
  const { bill, patient, appointment, clinic, dentist } = document;

  return (
    <div
      id="invoice-document"
      className={`print-invoice document-light mx-auto w-full max-w-[210mm] bg-white text-[#151918] p-8 sm:p-10 ${className ?? ""}`}
    >
      {/* ── Letterhead ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-[#0D6B5E]">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[#151918]">
            {clinic.name}
          </h1>
          {clinic.address && (
            <p className="text-xs text-[#737A76] mt-1 max-w-xs">{clinic.address}</p>
          )}
          <p className="text-xs text-[#737A76] mt-0.5">
            {[clinic.phone, clinic.email].filter(Boolean).join(" · ") || null}
          </p>
          <p className="text-xs text-[#5B635E] mt-2 font-medium">
            Dentist: {dentist.name}
            {clinic.registrationNumber && (
              <span className="text-[#9BA39D]"> · Reg. No. {clinic.registrationNumber}</span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-lg font-bold tracking-wide text-[#151918]">INVOICE</p>
          <p className="text-xs text-[#737A76] mt-1">
            No. <span className="font-mono font-medium text-[#151918]">{bill.invoiceNumber}</span>
          </p>
          <p className="text-xs text-[#737A76]">
            Date: {formatDateInTimezone(bill.invoiceDate, timezone)}
          </p>
          <div className="mt-2">
            <Badge variant={STATUS_VARIANT[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
          </div>
        </div>
      </div>

      {/* ── Patient / appointment ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 py-6 border-b border-[#E3E9E6]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BA39D] mb-1">
            Billed To
          </p>
          <p className="text-sm font-semibold text-[#151918]">{patient.name}</p>
          {patient.phone && <p className="text-xs text-[#737A76] mt-0.5">{patient.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9BA39D] mb-1">
            Appointment
          </p>
          <p className="text-sm text-[#151918]">
            {formatDateInTimezone(appointment.scheduledAt, timezone)}
          </p>
        </div>
      </div>

      {/* ── Itemized charges ──────────────────────────────────── */}
      <div className="py-6">
        <table className="w-full text-sm" style={{ pageBreakInside: "auto" }}>
          <thead>
            <tr className="border-b-2 border-[#0D6B5E] text-left text-[10px] font-semibold uppercase tracking-wider text-[#737A76]">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 px-2 text-right w-16">Qty</th>
              <th className="py-2 px-2 text-right w-28">Rate</th>
              <th className="py-2 pl-2 text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-[#9BA39D]">
                  No billable charges on this visit.
                </td>
              </tr>
            ) : (
              bill.lineItems.map((item) => (
                <tr
                  key={item.key}
                  className="border-b border-[#EEF2F0]"
                  style={{ pageBreakInside: "avoid" }}
                >
                  <td className="py-2.5 pr-2 text-[#151918]">{item.description}</td>
                  <td className="py-2.5 px-2 text-right text-[#5B635E]">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-right text-[#5B635E]">
                    {formatCurrency(item.rate)}
                  </td>
                  <td className="py-2.5 pl-2 text-right font-medium text-[#151918]">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Summary ────────────────────────────────────────────── */}
      <div className="flex justify-end pb-6">
        <div className="w-full max-w-[280px] space-y-1.5">
          <SummaryRow label="Subtotal" value={bill.subtotal} />
          <SummaryRow label="Discount" value={-bill.discount} />
          <div className="border-t border-[#E3E9E6] my-1.5" />
          <SummaryRow label="Total" value={bill.total} bold />
          <SummaryRow label="Amount Paid" value={bill.paid} valueClassName="text-[#16A34A]" />
          {bill.overpayment > 0 && (
            <SummaryRow
              label="Credit (Overpaid)"
              value={bill.overpayment}
              valueClassName="text-[#16A34A]"
            />
          )}
          <div className="border-t-2 border-[#0D6B5E] my-1.5" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-[#151918]">Balance Due</span>
            <span
              className={`text-lg font-bold ${
                bill.balanceDue > 0 ? "text-[#DC2626]" : "text-[#16A34A]"
              }`}
            >
              {formatCurrency(bill.balanceDue)}
            </span>
          </div>
        </div>
      </div>

      {/*
        ── Signature ──────────────────────────────────────────────
        When no signature is configured, this section renders NOTHING — no
        box, no "Authorized Signature" line, no placeholder, no "not
        configured" message. A bill without a signature must still read as a
        complete, professional document; staff can configure a signature from
        Clinic Settings directly (it's always in the main nav), not from a
        nudge on the bill itself.
      */}
      {dentist.signatureUrl && (
        <div className="pt-6 border-t border-[#E3E9E6]">
          <div className="flex flex-col items-end text-right ml-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dentist.signatureUrl}
              alt={`Signature of ${dentist.name}`}
              className="max-h-16 max-w-[200px] object-contain mb-1"
            />
            <div className="border-t border-[#0D6B5E] pt-1 w-full min-w-[180px]">
              <p className="text-xs font-semibold text-[#151918]">{dentist.name}</p>
              <p className="text-[10px] text-[#737A76]">Authorized Signature</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-[#9BA39D] mt-8">
        This is a system-generated bill from {clinic.name}.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  valueClassName,
}: {
  label: string;
  value: number;
  bold?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-sm ${bold ? "font-semibold text-[#151918]" : "text-[#737A76]"}`}>
        {label}
      </span>
      <span
        className={`text-sm ${bold ? "font-semibold text-[#151918]" : "text-[#5B635E]"} ${
          valueClassName ?? ""
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

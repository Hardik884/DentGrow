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
      className={`print-invoice mx-auto w-full max-w-[210mm] bg-white text-[#09090B] p-8 sm:p-10 ${className ?? ""}`}
    >
      {/* ── Letterhead ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-[#18181B]">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[#09090B]">
            {clinic.name}
          </h1>
          {clinic.address && (
            <p className="text-xs text-[#71717A] mt-1 max-w-xs">{clinic.address}</p>
          )}
          <p className="text-xs text-[#71717A] mt-0.5">
            {[clinic.phone, clinic.email].filter(Boolean).join(" · ") || null}
          </p>
          <p className="text-xs text-[#52525B] mt-2 font-medium">
            Dentist: {dentist.name}
            {clinic.registrationNumber && (
              <span className="text-[#A1A1AA]"> · Reg. No. {clinic.registrationNumber}</span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-lg font-bold tracking-wide text-[#09090B]">INVOICE</p>
          <p className="text-xs text-[#71717A] mt-1">
            No. <span className="font-mono font-medium text-[#09090B]">{bill.invoiceNumber}</span>
          </p>
          <p className="text-xs text-[#71717A]">
            Date: {formatDateInTimezone(bill.invoiceDate, timezone)}
          </p>
          <div className="mt-2">
            <Badge variant={STATUS_VARIANT[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
          </div>
        </div>
      </div>

      {/* ── Patient / appointment ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6 py-6 border-b border-[#E4E4E7]">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1">
            Billed To
          </p>
          <p className="text-sm font-semibold text-[#09090B]">{patient.name}</p>
          {patient.phone && <p className="text-xs text-[#71717A] mt-0.5">{patient.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1">
            Appointment
          </p>
          <p className="text-sm text-[#09090B]">
            {formatDateInTimezone(appointment.scheduledAt, timezone)}
          </p>
        </div>
      </div>

      {/* ── Itemized charges ──────────────────────────────────── */}
      <div className="py-6">
        <table className="w-full text-sm" style={{ pageBreakInside: "auto" }}>
          <thead>
            <tr className="border-b-2 border-[#18181B] text-left text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 px-2 text-right w-16">Qty</th>
              <th className="py-2 px-2 text-right w-28">Rate</th>
              <th className="py-2 pl-2 text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lineItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-[#A1A1AA]">
                  No billable charges on this visit.
                </td>
              </tr>
            ) : (
              bill.lineItems.map((item) => (
                <tr
                  key={item.key}
                  className="border-b border-[#F4F4F5]"
                  style={{ pageBreakInside: "avoid" }}
                >
                  <td className="py-2.5 pr-2 text-[#09090B]">{item.description}</td>
                  <td className="py-2.5 px-2 text-right text-[#52525B]">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-right text-[#52525B]">
                    {formatCurrency(item.rate)}
                  </td>
                  <td className="py-2.5 pl-2 text-right font-medium text-[#09090B]">
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
          <div className="border-t border-[#E4E4E7] my-1.5" />
          <SummaryRow label="Total" value={bill.total} bold />
          <SummaryRow label="Paid" value={bill.paid} valueClassName="text-[#16A34A]" />
          <div className="border-t-2 border-[#18181B] my-1.5" />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-[#09090B]">Balance Due</span>
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
        <div className="pt-6 border-t border-[#E4E4E7]">
          <div className="flex flex-col items-end text-right ml-auto w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dentist.signatureUrl}
              alt={`Signature of ${dentist.name}`}
              className="max-h-16 max-w-[200px] object-contain mb-1"
            />
            <div className="border-t border-[#18181B] pt-1 w-full min-w-[180px]">
              <p className="text-xs font-semibold text-[#09090B]">{dentist.name}</p>
              <p className="text-[10px] text-[#71717A]">Authorized Signature</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] text-[#A1A1AA] mt-8">
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
      <span className={`text-sm ${bold ? "font-semibold text-[#09090B]" : "text-[#71717A]"}`}>
        {label}
      </span>
      <span
        className={`text-sm ${bold ? "font-semibold text-[#09090B]" : "text-[#52525B]"} ${
          valueClassName ?? ""
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

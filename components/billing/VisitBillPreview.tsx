import Link from "next/link";
import { FileText } from "lucide-react";
import { getStaffBill } from "@/actions/billing";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
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

interface VisitBillPreviewProps {
  appointmentId: string;
  baseHref: string; // "/dentist" | "/receptionist"
}

/**
 * VisitBillPreview — the "Bill" side of the visit page's Billing & Payments
 * toggle. A compact summary (this visit's charges only) with a link to the
 * full, printable invoice — the dashboard page stays light; the multi-page
 * invoice itself lives on its own route (shared with the patient-profile
 * bill list and the patient portal).
 */
export async function VisitBillPreview({ appointmentId, baseHref }: VisitBillPreviewProps) {
  const result = await getStaffBill(appointmentId);

  if (result.error || !result.data) {
    return (
      <p className="text-sm text-text-secondary">
        {result.error ?? "No bill available for this visit."}
      </p>
    );
  }

  const { bill } = result.data;

  return (
    <div className="bg-surface border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">Bill · {bill.invoiceNumber}</p>
            <Badge variant={STATUS_VARIANT[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            {bill.lineItems.length} {bill.lineItems.length === 1 ? "charge" : "charges"} on this visit
          </p>
        </div>
        <Link
          href={`${baseHref}/appointments/${appointmentId}/bill`}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-text-primary hover:bg-surface-muted transition-colors"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          View Full Bill
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Total" value={formatCurrency(bill.total)} />
        <Stat label="Paid" value={formatCurrency(bill.paid)} accent="green" />
        <Stat
          label="Balance Due"
          value={formatCurrency(bill.balanceDue)}
          accent={bill.balanceDue > 0 ? "red" : undefined}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
}) {
  const color =
    accent === "green" ? "text-success" : accent === "red" ? "text-danger" : "text-text-primary";
  return (
    <div className="rounded-lg bg-background border border-border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

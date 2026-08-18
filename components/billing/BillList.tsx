import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BillSummary, BillStatus } from "@/lib/billing/invoice";

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

interface BillListProps {
  bills: BillSummary[];
  error?: string | null;
  /** Build the "View Bill" href for a summary row. */
  hrefFor: (bill: BillSummary) => string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * BillList — shared card list for "each treatment has its own bill".
 *
 * Used by both the staff-side patient-profile Bill tab and the patient
 * portal Bills tab; the caller supplies the summaries (already scoped and
 * authorized) and the link target for each row.
 */
export function BillList({
  bills,
  error,
  hrefFor,
  emptyTitle = "No bills yet",
  emptyDescription = "Bills appear here once a treatment has a billable charge.",
}: BillListProps) {
  if (error) {
    return (
      <p className="text-sm text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2">
        {error}
      </p>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl">
        <EmptyState
          icon={<FileText className="h-5 w-5" aria-hidden />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bills.map((bill) => {
        const href = hrefFor(bill);
        return (
          <div
            key={bill.treatmentId}
            className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-text-primary">{bill.treatmentType}</p>
                <Badge variant={STATUS_VARIANT[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">{formatDate(bill.treatmentDate)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-5">
              <Stat label="Total" value={formatCurrency(bill.total)} />
              <Stat label="Paid" value={formatCurrency(bill.paid)} valueClass="text-success" />
              <Stat
                label="Balance"
                value={formatCurrency(bill.balanceDue)}
                valueClass={bill.balanceDue > 0 ? "text-danger" : "text-success"}
              />
              {href ? (
                <Link
                  href={href}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-border text-text-primary hover:bg-surface-muted transition-colors shrink-0"
                >
                  View Bill
                </Link>
              ) : (
                <span className="text-xs text-text-disabled shrink-0">Unavailable</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wide text-text-disabled">{label}</p>
      <p className={`text-sm font-semibold ${valueClass ?? "text-text-primary"}`}>{value}</p>
    </div>
  );
}

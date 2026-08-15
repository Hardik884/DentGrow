import Link from "next/link";
import { FileText } from "lucide-react";
import { getClinicBillsList } from "@/actions/billing";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
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

interface ClinicBillingListProps {
  baseHref: string; // "/dentist" | "/receptionist"
  search?: string;
  page?: number;
}

/**
 * ClinicBillingList — the "Billing" panel inside /dentist/payments and
 * /receptionist/payments. Clinic-wide, one row per APPOINTMENT that has
 * billable financial activity (not per patient, not only the latest visit).
 *
 * Reuses getClinicBillsList, which itself reuses the same canonical
 * treatmentTotalCharge + allocateCollectionsToTreatments every other billing
 * screen is built on — no separate calculation.
 */
export async function ClinicBillingList({ baseHref, search, page = 1 }: ClinicBillingListProps) {
  const limit = 20;
  const result = await getClinicBillsList({ search, page, limit });

  if (result.error) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {result.error}
      </p>
    );
  }

  const bills = result.data?.bills ?? [];
  const total = result.data?.total ?? 0;

  if (bills.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl">
        <EmptyState
          icon={<FileText className="h-5 w-5" aria-hidden />}
          title="No bills yet"
          description="Bills appear here for every appointment with a billable charge or payment."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#71717A]">
        {total} {total === 1 ? "bill" : "bills"}
      </p>

      {bills.map((bill) => (
        <div
          key={bill.appointmentId}
          className="bg-white border border-[#E4E4E7] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-[#09090B]">{bill.patientName}</p>
              <Badge variant={STATUS_VARIANT[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
            </div>
            <p className="text-xs text-[#71717A] mt-0.5">
              {formatDate(bill.appointmentDate)} · {bill.treatmentDescription}
            </p>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <Stat label="Total" value={formatCurrency(bill.total)} />
            <Stat label="Paid" value={formatCurrency(bill.paid)} valueClass="text-[#16A34A]" />
            <Stat
              label="Balance"
              value={formatCurrency(bill.balanceDue)}
              valueClass={bill.balanceDue > 0 ? "text-[#DC2626]" : "text-[#16A34A]"}
            />
            <Link
              href={`${baseHref}/appointments/${bill.appointmentId}/bill`}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-[#E4E4E7] text-[#09090B] hover:bg-[#F4F4F5] transition-colors shrink-0"
            >
              View Bill
            </Link>
          </div>
        </div>
      ))}
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
      <p className="text-[10px] uppercase tracking-wide text-[#A1A1AA]">{label}</p>
      <p className={`text-sm font-semibold ${valueClass ?? "text-[#09090B]"}`}>{value}</p>
    </div>
  );
}

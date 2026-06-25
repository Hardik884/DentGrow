import Link from "next/link";
import { getPatientPayments, getOutstandingBalance } from "@/actions/payments";
import { getTreatmentsForPatient } from "@/actions/treatments";
import { PaymentList } from "@/components/dentist/PaymentList";
import { formatCurrency } from "@/lib/utils";
import type { Payment } from "@/types";

interface PatientPaymentsTabProps {
  patientId: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

/**
 * PatientPaymentsTab
 *
 * Server Component — payments panel on patient profile.
 * Shows outstanding balance, total cost, total paid, and payment timeline.
 * Both dentist and receptionist can see payment info.
 */
export async function PatientPaymentsTab({
  patientId,
  role,
  baseHref,
}: PatientPaymentsTabProps) {
  const [paymentsResult, balanceResult, treatmentsResult] = await Promise.all([
    getPatientPayments(patientId),
    getOutstandingBalance(patientId),
    getTreatmentsForPatient(patientId),
  ]);

  const payments = (paymentsResult.data ?? []) as Payment[];
  const balance = balanceResult.data ?? 0;
  const treatments = treatmentsResult.data ?? [];

  const totalCost = treatments.reduce(
    (sum, t) => sum + Number(t.cost ?? 0),
    0
  );
  const totalPaid = payments.reduce(
    (sum, p) => sum + Number(p.amount ?? 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Payments</h3>
        <Link
          href={`${baseHref}/payments/new?patient=${patientId}`}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + Record Payment
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Total Cost"
          value={formatCurrency(totalCost)}
          valueClass="text-gray-900"
        />
        <SummaryCard
          label="Total Paid"
          value={formatCurrency(totalPaid)}
          valueClass="text-green-600"
        />
        <SummaryCard
          label="Remaining"
          value={formatCurrency(balance)}
          valueClass={balance > 0 ? "text-red-600" : "text-green-600"}
        />
      </div>

      {paymentsResult.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {paymentsResult.error}
        </p>
      )}

      <PaymentList payments={payments} role={role} baseHref={baseHref} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="bg-gray-50 border rounded-lg p-3 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

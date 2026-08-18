import {
  getPatientPayments,
  getOutstandingBalance,
  getPaymentRecorderNames,
} from "@/actions/payments";
import { getTreatmentsForPatient } from "@/actions/treatments";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { sumTreatmentCharges } from "@/lib/billing/balance";
import { Plus } from "lucide-react";
import type { Payment, PaymentMethod } from "@/types";

interface PatientPaymentsTabProps {
  patientId: string;
  patientName?: string;
  role: "dentist" | "receptionist";
  baseHref: string;
}

/**
 * PatientPaymentsTab
 *
 * Server Component — payments panel on the patient profile / visit.
 * Shows total cost, total paid and remaining balance, followed by the
 * patient's complete payment history (newest first) with the remaining
 * balance after each payment and who recorded it.
 *
 * Reuses the existing payment/treatment/balance server actions — no
 * duplicated queries or balance calculations.
 */
export async function PatientPaymentsTab({
  patientId,
  patientName,
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

  // Every charge the patient has incurred: billable treatment cost plus the
  // OPD and X-ray fees recorded against those treatments. This must be the SAME
  // definition the outstanding balance uses, or the three cards stop adding up:
  //   Total Cost - Total Paid == Remaining (outstanding balance).
  // Summing bare `cost` here is what made a ₹400 X-ray visible on the treatment
  // but absent from the total the clinic reads off this panel.
  const totalCost = sumTreatmentCharges(
    treatments as { cost: number | null; status?: string | null }[]
  );
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Resolve "Recorded By" names for the payment recorders.
  const recorderIds = Array.from(
    new Set(payments.map((p) => p.created_by).filter((v): v is string => !!v))
  );
  const recordersResult = recorderIds.length
    ? await getPaymentRecorderNames(recorderIds)
    : { data: {} as Record<string, string> };
  const recorders = recordersResult.data ?? {};

  // Compute the remaining balance after each payment. Payments are returned
  // newest-first; walk oldest → newest to accumulate, then display newest-first.
  const chronological = [...payments].reverse();
  const remainingAfter = new Map<string, number>();
  let cumulativePaid = 0;
  for (const p of chronological) {
    cumulativePaid += Number(p.amount ?? 0);
    remainingAfter.set(p.id, Math.max(0, totalCost - cumulativePaid));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Payments</h3>
        <PaymentFormDialog
          patientId={patientId}
          patientName={patientName}
          triggerClassName={ACTION_BUTTON}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Record Payment
        </PaymentFormDialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total Cost" value={formatCurrency(totalCost)} valueClass="text-gray-900" />
        <SummaryCard label="Total Paid" value={formatCurrency(totalPaid)} valueClass="text-green-600" />
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

      {/* Payment history */}
      {payments.length === 0 ? (
        <div className="border rounded-lg p-6 text-center text-sm text-gray-500">
          No payment records found.
        </div>
      ) : (
        <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E3E9E6]">
            <h4 className="text-sm font-semibold text-[#151918]">Payment History</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F6F8F6] border-b border-[#E3E9E6]">
                <tr className="text-left text-xs font-medium text-[#737A76] uppercase tracking-wider">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Notes</th>
                  <th className="px-5 py-3">Remaining</th>
                  <th className="px-5 py-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F0]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F6F8F6] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap text-[#151918]">
                      {formatDate(p.payment_date)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap font-semibold text-[#16A34A]">
                      {formatCurrency(Number(p.amount))}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#EEF2F0] text-[#5B635E]">
                        {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[#5B635E]">
                      {p.payment_type === "opd" ? "OPD" : "Treatment"}
                    </td>
                    <td className="px-5 py-3 text-[#737A76]">
                      {p.notes ? <span className="line-clamp-2">{p.notes}</span> : <span className="text-[#9BA39D]">—</span>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[#151918]">
                      {formatCurrency(remainingAfter.get(p.id) ?? 0)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[#5B635E]">
                      {(p.created_by && recorders[p.created_by]) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

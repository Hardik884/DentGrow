import { getPortalOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";

/**
 * OutstandingBalanceCard
 *
 * Patient portal — outstanding balance card.
 * Balance computed server-side: SUM(treatments.cost) - SUM(payments.amount).
 * Resolves patient via portal link — no patientId needed.
 * Shown prominently if balance > 0 (red); green if cleared.
 */
export async function OutstandingBalanceCard() {
  const result = await getPortalOutstandingBalance();
  const balance = result.data ?? 0;

  if (result.error) {
    return (
      <div className="border rounded-xl p-4 bg-gray-50 border-gray-200 text-center">
        <p className="text-sm text-gray-500">Unable to load balance.</p>
      </div>
    );
  }

  if (balance <= 0) {
    return (
      <div className="border rounded-xl p-4 bg-green-50 border-green-200 text-center">
        <p className="text-sm text-green-700 font-medium">No outstanding balance ✓</p>
        <p className="text-xs text-green-500 mt-0.5">Your account is clear.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-6 bg-red-50 border-red-200 text-center">
      <p className="text-sm font-medium text-red-600 uppercase tracking-wide">
        Outstanding Balance
      </p>
      <p className="text-3xl font-bold text-red-700 mt-1">
        {formatCurrency(balance)}
      </p>
      <p className="text-xs text-red-400 mt-2">
        Please contact the clinic to arrange payment.
      </p>
    </div>
  );
}

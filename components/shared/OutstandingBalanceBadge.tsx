import { getOutstandingBalance } from "@/actions/patients";
import { formatCurrency } from "@/lib/utils";

interface OutstandingBalanceBadgeProps {
  /** Fetches balance from the server when provided */
  patientId?: string;
  /** Pre-computed balance — skips the fetch when provided */
  balance?: number;
}

/**
 * OutstandingBalanceBadge
 *
 * Server Component — displays a patient's outstanding balance.
 * Balance is always computed server-side: SUM(treatments.cost) - SUM(payments.amount).
 * Never trusted from the client.
 *
 * Red / prominent when balance > 0; green / muted when settled.
 */
export async function OutstandingBalanceBadge({
  patientId,
  balance: precomputed,
}: OutstandingBalanceBadgeProps) {
  let amount = precomputed ?? 0;

  if (precomputed === undefined && patientId) {
    const result = await getOutstandingBalance(patientId);
    amount = result.data ?? 0;
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Outstanding Balance
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          amount > 0 ? "text-red-600" : "text-green-600"
        }`}
      >
        {formatCurrency(amount)}
      </p>
      {amount > 0 && (
        <p className="text-xs text-gray-500 mt-1">Payment required</p>
      )}
    </div>
  );
}

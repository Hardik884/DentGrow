import { getOutstandingBalance } from "@/actions/patients";
import { formatCurrency } from "@/lib/utils";

interface OutstandingBalanceBadgeProps {
  patientId?: string;
  balance?: number;
}

export async function OutstandingBalanceBadge({ patientId, balance: precomputed }: OutstandingBalanceBadgeProps) {
  let amount = precomputed ?? 0;

  if (precomputed === undefined && patientId) {
    const result = await getOutstandingBalance(patientId);
    amount = result.data ?? 0;
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <p className="text-xs font-medium text-text-secondary tracking-wide">Remaining Balance</p>
      <p className={`text-2xl font-semibold mt-2 tracking-tight ${amount > 0 ? "text-danger" : "text-success"}`}>
        {formatCurrency(amount)}
      </p>
      {amount > 0 && (
        <p className="text-xs text-text-secondary mt-1">Payment required</p>
      )}
    </div>
  );
}

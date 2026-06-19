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
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
      <p className="text-xs font-medium text-[#71717A] tracking-wide">Outstanding Balance</p>
      <p className={`text-2xl font-semibold mt-2 tracking-tight ${amount > 0 ? "text-[#DC2626]" : "text-[#16A34A]"}`}>
        {formatCurrency(amount)}
      </p>
      {amount > 0 && (
        <p className="text-xs text-[#71717A] mt-1">Payment required</p>
      )}
    </div>
  );
}

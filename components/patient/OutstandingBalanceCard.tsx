import { getPortalOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "lucide-react";

export async function OutstandingBalanceCard() {
  const result = await getPortalOutstandingBalance();
  const balance = result.data ?? 0;

  if (result.error) {
    return (
      <div className="border border-[#E4E4E7] rounded-xl p-4 bg-[#FAFAFA] text-center">
        <p className="text-sm text-[#71717A]">Unable to load balance.</p>
      </div>
    );
  }

  if (balance <= 0) {
    return (
      <div className="border border-[#BBF7D0] rounded-xl p-4 bg-[#F0FDF4] flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-[#16A34A] shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium text-[#16A34A]">No outstanding balance</p>
          <p className="text-xs text-[#71717A] mt-0.5">Your account is all clear.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#FECACA] rounded-xl p-5 bg-[#FEF2F2]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" aria-hidden />
          <p className="text-sm font-medium text-[#DC2626]">Outstanding Balance</p>
        </div>
        <p className="text-lg font-semibold text-[#09090B]">{formatCurrency(balance)}</p>
      </div>
      <p className="text-xs text-[#71717A] mt-1.5">Please contact the clinic to arrange payment.</p>
    </div>
  );
}

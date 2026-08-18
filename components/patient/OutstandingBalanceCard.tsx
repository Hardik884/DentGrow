import { getPortalOutstandingBalance } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "lucide-react";

export async function OutstandingBalanceCard() {
  const result = await getPortalOutstandingBalance();
  const balance = result.data ?? 0;

  if (result.error) {
    return (
      <div className="border border-border rounded-xl p-4 bg-background text-center">
        <p className="text-sm text-text-secondary">Unable to load balance.</p>
      </div>
    );
  }

  if (balance <= 0) {
    return (
      <div className="border border-success-border rounded-xl p-4 bg-success-bg flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium text-success">No remaining balance</p>
          <p className="text-xs text-text-secondary mt-0.5">Your account is all clear.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-danger-border rounded-xl p-5 bg-danger-bg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-danger shrink-0" aria-hidden />
          <p className="text-sm font-medium text-danger">Remaining Balance</p>
        </div>
        <p className="text-lg font-semibold text-text-primary">{formatCurrency(balance)}</p>
      </div>
      <p className="text-xs text-text-secondary mt-1.5">Please contact the clinic to arrange payment.</p>
    </div>
  );
}

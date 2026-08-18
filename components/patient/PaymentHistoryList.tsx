import { getPortalPayments } from "@/actions/payments";
import { formatDate, formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard } from "lucide-react";
import type { PaymentMethod } from "@/types";

export async function PaymentHistoryList() {
  const result = await getPortalPayments();
  const payments = result.data ?? [];

  if (result.error) {
    return (
      <div className="border border-[#FECACA] rounded-xl p-4 text-xs text-[#DC2626] bg-[#FEF2F2] text-center">
        Failed to load payments. Please try again later.
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="bg-white border border-[#E3E9E6] rounded-xl">
        <EmptyState
          icon={<CreditCard className="h-5 w-5" aria-hidden />}
          title="No payment records"
          description="Your payment history will appear here."
        />
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden divide-y divide-[#EEF2F0]">
      {payments.map((payment) => (
        <div key={payment.id} className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-[#151918]">
              {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod]}
            </p>
            <p className="text-xs text-[#9BA39D]">{formatDate(payment.payment_date)}</p>
            {payment.notes && (
              <p className="text-xs text-[#737A76]">{payment.notes}</p>
            )}
          </div>
          <span className="text-sm font-semibold text-[#16A34A] shrink-0">
            +{formatCurrency(Number(payment.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}

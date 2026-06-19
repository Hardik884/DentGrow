import { getPortalPayments } from "@/actions/payments";
import { formatDate, formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

/**
 * PaymentHistoryList
 *
 * Patient portal — payment history list.
 * Uses getPortalPayments() which resolves patient via portal link.
 */
export async function PaymentHistoryList() {
  const result = await getPortalPayments();
  const payments = result.data ?? [];

  if (result.error) {
    return (
      <div className="border rounded-lg p-4 text-sm text-red-600 text-center">
        Failed to load payments. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-900">Payment History</h2>

      {payments.length === 0 ? (
        <div className="border rounded-lg p-6 text-sm text-gray-500 text-center">
          No payment records found.
        </div>
      ) : (
        payments.map((payment) => (
          <div
            key={payment.id}
            className="border rounded-lg p-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-gray-900">
                {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod]}
              </p>
              <p className="text-xs text-gray-400">{formatDate(payment.payment_date)}</p>
              {payment.notes && (
                <p className="text-xs text-gray-500">{payment.notes}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-green-600 shrink-0">
              +{formatCurrency(Number(payment.amount))}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

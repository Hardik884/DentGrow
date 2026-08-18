import { formatDate, formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/utils";
import type { Payment, PaymentMethod } from "@/types";

interface PaymentListProps {
  payments: Payment[];
  /** Show patient link column in clinic-wide views */
  showPatient?: boolean;
  role?: "dentist" | "receptionist";
  baseHref?: string;
}

/**
 * PaymentList
 *
 * Renders a list of payment transactions.
 * Used in patient profile (payment tab) and payment ledger pages.
 * Server Component — receives pre-fetched payments via props.
 */
export function PaymentList({
  payments,
  showPatient = false,
  role = "dentist",
  baseHref,
}: PaymentListProps) {
  const base = baseHref ?? `/${role}`;

  if (payments.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-center text-sm text-gray-500">
        No payment records found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="bg-white border rounded-lg p-4 flex items-center justify-between gap-4"
        >
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {PAYMENT_METHOD_LABELS[payment.method as PaymentMethod]}
              </span>
              {showPatient && (payment as unknown as { patients?: { name: string; id: string } }).patients && (
                <a
                  href={`${base}/patients/${(payment as unknown as { patients: { id: string } }).patients.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  {(payment as unknown as { patients: { name: string } }).patients.name}
                </a>
              )}
            </div>
            <p className="text-xs text-gray-400">{formatDate(payment.payment_date)}</p>
            {payment.notes && (
              <p className="text-xs text-gray-500 mt-0.5">{payment.notes}</p>
            )}
          </div>

          <span className="text-sm font-semibold text-green-600 shrink-0">
            +{formatCurrency(Number(payment.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}

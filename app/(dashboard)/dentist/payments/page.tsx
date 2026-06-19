import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { getPaymentsToday } from "@/actions/payments";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments — DentGrow",
};

/**
 * /dentist/payments
 *
 * Payment ledger — dentist view.
 * Shows today's revenue KPI + outstanding balances.
 */
export default async function DentistPaymentsPage() {
  const todayResult = await getPaymentsToday();
  const revenueToday = todayResult.data ?? 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payments"
        action={{ label: "Record Payment", href: "/dentist/payments/new" }}
      />

      {/* Revenue today */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Revenue Today
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(revenueToday)}
          </p>
        </div>
      </div>

      {/* Outstanding balances */}
      <PendingPaymentsList />
    </div>
  );
}

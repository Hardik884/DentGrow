import type { Metadata } from "next";
import { PaymentHistoryList } from "@/components/patient/PaymentHistoryList";
import { OutstandingBalanceCard } from "@/components/patient/OutstandingBalanceCard";

export const metadata: Metadata = {
  title: "Payments",
};

/**
 * /portal/payments
 * Payment history + outstanding balance — patient view.
 * Outstanding balance computed server-side: SUM(treatments.cost) - SUM(payments.amount).
 */
export default async function PortalPaymentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Payments</h1>

      {/* Outstanding balance card — highlighted if balance > 0 */}
      <OutstandingBalanceCard />

      {/* Full payment history list */}
      <PaymentHistoryList />
    </div>
  );
}


import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";

export const metadata: Metadata = {
  title: "Payments",
};

/**
 * /receptionist/payments
 * Pending payments list — receptionist view.
 * Shows patients with outstanding balance > 0.
 */
export default async function ReceptionistPaymentsPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payments"
        action={{ label: "Record Payment", href: "/receptionist/payments/new" }}
      />
      <PendingPaymentsList />
    </div>
  );
}


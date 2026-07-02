import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { checkReceptionistPaymentAccess } from "@/actions/clinic-settings";

export const metadata: Metadata = {
  title: "Payments",
};

/**
 * /receptionist/payments
 * 
 * Conditional payment access page for receptionists.
 * Shown only when dentist enables "Allow Receptionist to Access Payments" in Clinic Settings.
 * Reuses the existing dentist payment module.
 */
export default async function ReceptionistPaymentsPage() {
  const hasAccess = await checkReceptionistPaymentAccess();

  if (!hasAccess) {
    redirect("/receptionist");
  }

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


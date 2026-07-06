import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PaymentFilters } from "@/components/dentist/PaymentFilters";
import { PaymentsView } from "@/components/dentist/PaymentsView";
import { checkReceptionistPaymentAccess } from "@/actions/clinic-settings";

export const metadata: Metadata = {
  title: "Payments",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    method?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /receptionist/payments
 * 
 * Conditional payment access page for receptionists.
 * Shown only when dentist enables "Allow Receptionist to Access Payments" in Clinic Settings.
 * Reuses the existing dentist payment module.
 */
export default async function ReceptionistPaymentsPage({ searchParams }: Props) {
  const hasAccess = await checkReceptionistPaymentAccess();

  if (!hasAccess) {
    redirect("/receptionist");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payments"
        action={{ label: "Record Payment", href: "/receptionist/payments/new" }}
      />

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <PaymentFilters
          initialSearch={params.search ?? ""}
          initialMethod={params.method ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* Outstanding balances (now filtered by search) */}
      <PendingPaymentsList search={params.search} />

      {/* Payment history list (client component, TanStack Query cache) */}
      <PaymentsView
        page={page}
        limit={limit}
        search={params.search}
        method={params.method}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
        basePath="/receptionist"
      />
    </div>
  );
}


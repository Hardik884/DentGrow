import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PaymentFilters } from "@/components/dentist/PaymentFilters";
import { PaymentsView } from "@/components/dentist/PaymentsView";
import { ConsultancyIncomePanel } from "@/components/dentist/ConsultancyIncomePanel";
import { getPaymentsToday } from "@/actions/payments";
import { getConsultancyRevenueToday } from "@/actions/consultants";
import { formatCurrency } from "@/lib/utils";

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
 * /dentist/payments
 *
 * Payment ledger — dentist view.
 * Shows today's revenue KPI + outstanding balances + searchable payment history.
 */
export default async function DentistPaymentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const [todayResult, consultancyTodayResult] = await Promise.all([
    getPaymentsToday(),
    getConsultancyRevenueToday(),
  ]);
  const revenueToday = todayResult.data ?? 0;
  const consultancyRevenueToday = consultancyTodayResult.data ?? 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payments"
        action={{ label: "Record Payment", href: "/dentist/payments/new" }}
      >
        <ConsultancyIncomePanel />
      </PageHeader>

      {/* Revenue today + consultancy revenue today */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Revenue Today
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(revenueToday)}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Consultancy Revenue Today
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(consultancyRevenueToday)}
          </p>
        </div>
      </div>

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
        basePath="/dentist"
      />
    </div>
  );
}


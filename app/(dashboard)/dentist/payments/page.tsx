import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PaymentFilters } from "@/components/dentist/PaymentFilters";
import { PaymentsView } from "@/components/dentist/PaymentsView";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { OpdPaymentDialog } from "@/components/dentist/OpdPaymentDialog";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { paymentsQuickFilters } from "@/lib/quick-filters";
import { getPaymentsToday } from "@/actions/payments";
import { getConsultancyRevenueToday } from "@/actions/consultants";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone, formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    method?: string;
    paymentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /dentist/payments
 *
 * Payment ledger — dentist view.
 * Shows today's clinic / consultancy / total revenue + outstanding balances +
 * searchable payment history (treatment + OPD payments).
 */
export default async function DentistPaymentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const [todayResult, consultancyTodayResult] = await Promise.all([
    getPaymentsToday(),
    getConsultancyRevenueToday(),
  ]);
  const clinicRevenueToday = todayResult.data ?? 0;
  const consultancyRevenueToday = consultancyTodayResult.data ?? 0;
  const totalRevenueToday = clinicRevenueToday + consultancyRevenueToday;

  const clinicTimezone = await getClinicTimezone();
  const today = getTodayInTimezone(clinicTimezone);
  const quickFilters = paymentsQuickFilters(today);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Payments">
        <PaymentFormDialog triggerVariant="default">Add Payment</PaymentFormDialog>
        <OpdPaymentDialog triggerVariant="default">Add OPD Payment</OpdPaymentDialog>
      </PageHeader>

      {/* Today's revenue: clinic + consultancy = total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Today&apos;s Clinic Revenue
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(clinicRevenueToday)}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Today&apos;s Consultancy Revenue
          </p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(consultancyRevenueToday)}
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Today&apos;s Total Revenue
          </p>
          <p className="text-2xl font-bold text-[#09090B] mt-1">
            {formatCurrency(totalRevenueToday)}
          </p>
        </div>
      </div>

      {/* Quick filters */}
      <Suspense>
        <QuickFilters trackKeys={quickFilters.trackKeys} chips={quickFilters.chips} />
      </Suspense>

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
        paymentType={params.paymentType}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
        basePath="/dentist"
      />
    </div>
  );
}

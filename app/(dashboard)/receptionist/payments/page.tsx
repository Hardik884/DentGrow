import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PendingPaymentsList } from "@/components/receptionist/PendingPaymentsList";
import { PaymentFilters } from "@/components/dentist/PaymentFilters";
import { PaymentsView } from "@/components/dentist/PaymentsView";
import { PaymentFormDialog } from "@/components/dentist/PaymentFormDialog";
import { OpdPaymentDialog } from "@/components/dentist/OpdPaymentDialog";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { SegmentedTabs } from "@/components/shared/SegmentedTabs";
import { ClinicBillingList } from "@/components/billing/ClinicBillingList";
import { paymentsQuickFilters } from "@/lib/quick-filters";
import { checkReceptionistPaymentAccess } from "@/actions/clinic-settings";
import { getClinicTimezone } from "@/lib/clinic/config";
import { getTodayInTimezone } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Billing & Payments",
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
 * /receptionist/payments
 *
 * Conditional payment access page for receptionists. Shown only when the
 * dentist enables "Allow Receptionist to Access Payments" in Clinic Settings.
 *
 * Billing & Payments — [ Payments ] [ Billing ] toggle, PAYMENTS ALWAYS
 * DEFAULT. Mirrors the dentist page exactly (see that file's doc comment).
 */
export default async function ReceptionistPaymentsPage({ searchParams }: Props) {
  const hasAccess = await checkReceptionistPaymentAccess();

  if (!hasAccess) {
    redirect("/receptionist");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const clinicTimezone = await getClinicTimezone();
  const today = getTodayInTimezone(clinicTimezone);
  const quickFilters = paymentsQuickFilters(today);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Billing & Payments">
        <PaymentFormDialog triggerVariant="default">Add Payment</PaymentFormDialog>
        <OpdPaymentDialog triggerVariant="default">Add OPD Payment</OpdPaymentDialog>
      </PageHeader>

      <SegmentedTabs
        tabs={[
          { key: "payments", label: "Payments" },
          { key: "billing", label: "Billing" },
        ]}
        defaultKey="payments"
        panels={{
          payments: (
            <div className="space-y-6">
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
              <PendingPaymentsList search={params.search} basePath="/receptionist" />

              {/* Payment history list (client component, TanStack Query cache) */}
              <PaymentsView
                page={page}
                limit={limit}
                search={params.search}
                method={params.method}
                paymentType={params.paymentType}
                dateFrom={params.dateFrom}
                dateTo={params.dateTo}
                basePath="/receptionist"
              />
            </div>
          ),
          billing: (
            <ClinicBillingList baseHref="/receptionist" search={params.search} page={page} />
          ),
        }}
      />
    </div>
  );
}

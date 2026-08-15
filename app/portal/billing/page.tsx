import type { Metadata } from "next";
import { SegmentedTabs } from "@/components/shared/SegmentedTabs";
import { PortalBillListView } from "@/components/billing/PortalBillListView";
import { PaymentHistoryList } from "@/components/patient/PaymentHistoryList";
import { OutstandingBalanceCard } from "@/components/patient/OutstandingBalanceCard";

export const metadata: Metadata = {
  title: "Billing & Payments",
};

/**
 * /portal/billing
 *
 * Patient-facing Billing & Payments: [ Payments ] [ Bills ].
 * PAYMENTS IS ALWAYS THE DEFAULT VIEW, matching the staff-side pages.
 * [ Payments ] reuses the EXISTING <OutstandingBalanceCard> +
 * <PaymentHistoryList> composition from /portal/payments, unmodified.
 * [ Bills ] is additional — one bill per treatment, own data only
 * (server-resolved via patient_portal_links, never a client-supplied
 * patient id — a patient can never see another patient's bills).
 */
export default async function PortalBillingPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Billing &amp; Payments</h1>

      <SegmentedTabs
        tabs={[
          { key: "payments", label: "Payments" },
          { key: "bills", label: "Bills" },
        ]}
        defaultKey="payments"
        panels={{
          payments: (
            <div className="space-y-6">
              <OutstandingBalanceCard />
              <PaymentHistoryList />
            </div>
          ),
          bills: <PortalBillListView />,
        }}
      />
    </div>
  );
}

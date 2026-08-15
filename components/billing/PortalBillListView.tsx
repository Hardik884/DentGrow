import { getPortalBillsList } from "@/actions/billing";
import { BillList } from "@/components/billing/BillList";

/**
 * PortalBillListView — "My Bills" for the authenticated patient. The
 * underlying action resolves the patient strictly from the session
 * (patient_portal_links), so this can never render another patient's bills.
 */
export async function PortalBillListView() {
  const result = await getPortalBillsList();
  const bills = result.data ?? [];

  return (
    <BillList
      bills={bills}
      error={result.error}
      hrefFor={(bill) => `/portal/billing/${bill.treatmentId}`}
      emptyTitle="No bills yet"
      emptyDescription="Your bills will appear here after your first billed visit."
    />
  );
}

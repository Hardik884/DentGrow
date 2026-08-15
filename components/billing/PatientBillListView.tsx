import { getPatientBillsList } from "@/actions/billing";
import { BillList } from "@/components/billing/BillList";

interface PatientBillListViewProps {
  patientId: string;
  baseHref: string; // "/dentist" | "/receptionist"
}

/**
 * PatientBillListView — the "Bill" side of the patient-profile
 * Billing & Payments tab. One row per treatment that carries a charge,
 * linking to that treatment's own bill.
 */
export async function PatientBillListView({ patientId, baseHref }: PatientBillListViewProps) {
  const result = await getPatientBillsList(patientId);
  const bills = result.data ?? [];

  return (
    <BillList
      bills={bills}
      error={result.error}
      hrefFor={(bill) =>
        bill.appointmentId
          ? `${baseHref}/appointments/${bill.appointmentId}/bill?treatment=${bill.treatmentId}&from=patient`
          : null
      }
    />
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PrescriptionFilters } from "@/components/receptionist/PrescriptionFilters";
import { PrescriptionsView } from "@/components/receptionist/PrescriptionsView";
import { getDentistList } from "@/actions/prescriptions";
import { getClinicTimezone } from "@/lib/clinic/config";

export const metadata: Metadata = {
  title: "Prescription History",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    treatmentType?: string;
    dentistId?: string;
    medicineName?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /receptionist/prescriptions
 *
 * Receptionist-only Prescription History page.
 * Displays completed treatments containing medicines with search and filter capabilities.
 * Receptionists can view and print prescriptions but cannot edit them.
 */
export default async function ReceptionistPrescriptionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  // Fetch dentist list for filter dropdown
  const dentistListResult = await getDentistList();
  const dentists = dentistListResult.data ?? [];

  // Clinic timezone so displayed prescription dates show the clinic-local day.
  const clinicTimezone = await getClinicTimezone();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Prescription History"
        description="View and print past prescriptions for patient inquiries"
      />

      {/* Filters (client component, drives URL params) */}
      <Suspense>
        <PrescriptionFilters
          dentists={dentists}
          initialSearch={params.search ?? ""}
          initialTreatmentType={params.treatmentType ?? ""}
          initialDentistId={params.dentistId ?? ""}
          initialMedicineName={params.medicineName ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* List (client component, TanStack Query cache) */}
      <PrescriptionsView
        page={page}
        limit={limit}
        search={params.search}
        treatmentType={params.treatmentType}
        dentistId={params.dentistId}
        medicineName={params.medicineName}
        dateFrom={params.dateFrom}
        dateTo={params.dateTo}
        clinicTimezone={clinicTimezone}
      />
    </div>
  );
}

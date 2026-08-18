import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientsView } from "@/components/shared/PatientsView";
import { QuickFilters } from "@/components/shared/QuickFilters";
import { patientsQuickFilters } from "@/lib/quick-filters";

export const metadata: Metadata = {
  title: "Patients",
};

interface Props {
  searchParams: Promise<{ page?: string; search?: string; filter?: string }>;
}

/**
 * /receptionist/patients
 *
 * Thin Server Component shell. Shares PatientsView (TanStack Query) with the
 * dentist patients page; only the baseHref differs.
 */
export default async function ReceptionistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search, filter } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;
  const quickFilters = patientsQuickFilters();

  return (
    <div className="p-6 lg:p-8 max-w-screen-xl space-y-4">
      <PageHeader title="Patients" description="Patient directory" />
      <Suspense>
        <QuickFilters trackKeys={quickFilters.trackKeys} chips={quickFilters.chips} />
      </Suspense>
      <PatientsView page={page} limit={limit} search={search} filter={filter} baseHref="/receptionist" />
    </div>
  );
}

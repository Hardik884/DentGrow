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
 * /dentist/patients
 *
 * Thin Server Component shell. The list itself is rendered by PatientsView,
 * a Client Component backed by TanStack Query — so return navigation is
 * instant from cache while `getPatients` remains the source of truth.
 */
export default async function DentistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search, filter } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;
  const quickFilters = patientsQuickFilters();

  return (
    <div className="p-6 max-w-screen-xl space-y-4">
      <PageHeader title="Patients" description="Patient directory" />
      <Suspense>
        <QuickFilters trackKeys={quickFilters.trackKeys} chips={quickFilters.chips} />
      </Suspense>
      <PatientsView page={page} limit={limit} search={search} filter={filter} baseHref="/dentist" />
    </div>
  );
}

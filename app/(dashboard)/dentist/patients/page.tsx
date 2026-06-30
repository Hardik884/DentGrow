import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientsView } from "@/components/shared/PatientsView";

export const metadata: Metadata = {
  title: "Patients",
};

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

/**
 * /dentist/patients
 *
 * Thin Server Component shell. The list itself is rendered by PatientsView,
 * a Client Component backed by TanStack Query — so return navigation is
 * instant from cache while `getPatients` remains the source of truth.
 */
export default async function DentistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader title="Patients" description="Patient directory" />
      <PatientsView page={page} limit={limit} search={search} baseHref="/dentist" />
    </div>
  );
}

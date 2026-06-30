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
 * /receptionist/patients
 *
 * Thin Server Component shell. Shares PatientsView (TanStack Query) with the
 * dentist patients page; only the baseHref differs.
 */
export default async function ReceptionistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader title="Patients" description="Patient directory" />
      <PatientsView page={page} limit={limit} search={search} baseHref="/receptionist" />
    </div>
  );
}

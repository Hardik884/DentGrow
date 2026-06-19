import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientListTable } from "@/components/shared/PatientListTable";
import { getPatients } from "@/actions/patients";

export const metadata: Metadata = {
  title: "Patients — DentGrow",
};

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

/**
 * /receptionist/patients
 *
 * Server Component — paginated patient list with search.
 * Receptionist role: create + read + update. No delete.
 */
export default async function ReceptionistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search } = await searchParams;

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;

  const result = await getPatients({ page, limit, search });
  const { patients, total } = result.data ?? { patients: [], total: 0 };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Patients"
        action={{ label: "+ New Patient", href: "/receptionist/patients/new" }}
      />

      {/* Search */}
      <form method="GET" className="flex gap-2">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search by name or phone…"
          className="flex-1 max-w-sm px-4 py-2 text-sm border border-gray-300 rounded-md
                     shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          aria-label="Search patients"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
        {search && (
          <a
            href="/receptionist/patients"
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {search && (
        <p className="text-sm text-gray-500">
          {total} result{total !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
        </p>
      )}

      <PatientListTable
        patients={patients}
        total={total}
        page={page}
        limit={limit}
        baseHref="/receptionist"
        search={search}
      />
    </div>
  );
}

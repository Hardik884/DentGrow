import type { Metadata } from "next";
import { PageHeader } from "@/components/layouts/PageHeader";
import { PatientListTable } from "@/components/shared/PatientListTable";
import { getPatients } from "@/actions/patients";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, X } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Patients",
};

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function ReceptionistPatientsPage({ searchParams }: Props) {
  const { page: pageParam, search } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const limit = 20;

  const result = await getPatients({ page, limit, search });
  const { patients, total } = result.data ?? { patients: [], total: 0 };

  return (
    <div className="p-6 max-w-screen-xl">
      <PageHeader
        title="Patients"
        description={`${total} patient${total !== 1 ? "s" : ""} in total`}
        action={{ label: "Add Patient", href: "/receptionist/patients/new", icon: <Plus className="h-3.5 w-3.5" /> }}
      />

      <form method="GET" className="flex gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1AA]" aria-hidden />
          <Input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Search by name or phone…"
            aria-label="Search patients"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
        {search && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/receptionist/patients">
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </Link>
          </Button>
        )}
      </form>

      {search && (
        <p className="text-xs text-[#71717A] mb-3">
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


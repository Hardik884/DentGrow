import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TreatmentList } from "@/components/dentist/TreatmentList";
import { getAllTreatments } from "@/actions/treatments";
import { TREATMENT_STATUS_LABELS, formatCurrency } from "@/lib/utils";
import type { Treatment, TreatmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Treatments — DentGrow",
};

interface Props {
  searchParams: Promise<{ status?: string; page?: string }>;
}

const STATUS_VALUES: TreatmentStatus[] = ["planned", "in_progress", "completed", "cancelled"];

/**
 * /dentist/treatments
 *
 * All treatments across the clinic — dentist view.
 * Full records including internal_notes.
 * Filterable by status.
 */
export default async function DentistTreatmentsPage({ searchParams }: Props) {
  const { status, page: pageStr } = await searchParams;
  const page = Number(pageStr ?? 1);

  const result = await getAllTreatments({
    page,
    limit: 20,
    status: status || undefined,
  });

  const treatments = (result.data?.treatments ?? []) as Treatment[];
  const total = result.data?.total ?? 0;

  const totalCost = treatments.reduce((sum, t) => sum + Number(t.cost ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Treatments" />

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/dentist/treatments"
          className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
            !status
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          All ({!status ? total : "–"})
        </Link>
        {STATUS_VALUES.map((s) => (
          <Link
            key={s}
            href={`/dentist/treatments?status=${s}`}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              status === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {TREATMENT_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {/* Summary */}
      {treatments.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{total} treatment{total !== 1 ? "s" : ""}</span>
          <span>Total cost: {formatCurrency(totalCost)}</span>
        </div>
      )}

      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {/* Treatments list with patient names */}
      <TreatmentList
        treatments={treatments}
        role="dentist"
        baseHref="/dentist"
        showPatient
      />

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {Math.ceil(total / 20)}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dentist/treatments?${status ? `status=${status}&` : ""}page=${page - 1}`}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page * 20 < total && (
              <Link
                href={`/dentist/treatments?${status ? `status=${status}&` : ""}page=${page + 1}`}
                className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


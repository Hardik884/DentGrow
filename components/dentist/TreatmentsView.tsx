"use client";

/**
 * TreatmentsView
 *
 * Client view for the dentist Treatments list. Backed by TanStack Query for
 * instant return navigation; `getAllTreatments` stays the source of truth.
 * TreatmentFilters remains a separate client component that drives the URL.
 */

import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAllTreatments } from "@/actions/treatments";
import { queryKeys } from "@/lib/query/keys";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { Eye } from "lucide-react";
import {
  TREATMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type { Treatment, TreatmentStatus } from "@/types";

const STATUS_VARIANT_MAP: Record<
  TreatmentStatus,
  "default" | "info" | "success" | "error"
> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

interface TreatmentsViewProps {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  treatmentType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function TreatmentsView({
  page,
  limit,
  search,
  status,
  treatmentType,
  dateFrom,
  dateTo,
}: TreatmentsViewProps) {
  const { data, isPending, isError, error, isPlaceholderData, isFetching } =
    useQuery({
      queryKey: queryKeys.treatments.list({
        page,
        search: search ?? "",
        status: status ?? "",
        treatmentType: treatmentType ?? "",
        dateFrom: dateFrom ?? "",
        dateTo: dateTo ?? "",
      }),
      queryFn: async () => {
        const res = await getAllTreatments({
          page,
          limit,
          search,
          status: status || undefined,
          treatmentType,
          dateFrom,
          dateTo,
        });
        if (res.error) throw new Error(res.error);
        return res.data ?? { treatments: [], total: 0 };
      },
      placeholderData: keepPreviousData,
    });

  const treatments = (data?.treatments ?? []) as Treatment[];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (status)        sp.set("status",        status);
    if (search)        sp.set("search",        search);
    if (treatmentType) sp.set("treatmentType", treatmentType);
    if (dateFrom)      sp.set("dateFrom",      dateFrom);
    if (dateTo)        sp.set("dateTo",        dateTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  if (isPending) {
    return (
      <>
        <p className="text-sm text-[#71717A]">Loading treatments…</p>
        <ListTableSkeleton />
      </>
    );
  }

  return (
    <>
      {/* Results count */}
      <p className="text-sm text-[#71717A]">
        {total} treatment{total !== 1 ? "s" : ""} found
      </p>

      {/* Error */}
      {isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {(error as Error)?.message ?? "Failed to load treatments."}
        </p>
      )}

      {/* Table */}
      {treatments.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-[#71717A] text-sm">No treatments match your filters.</p>
          <p className="text-[#A1A1AA] text-xs mt-1">
            Try adjusting the date range or clearing filters.
          </p>
        </div>
      ) : (
        <div
          className={
            isPlaceholderData && isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F4F4F5] bg-[#FAFAFA] text-left text-xs font-semibold text-[#71717A] uppercase tracking-wide">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Treatment Type</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5]">
                  {treatments.map((tx) => {
                    const patientRow = (
                      tx as unknown as { patients?: { id: string; name: string; phone?: string } }
                    ).patients;
                    return (
                      <tr key={tx.id} className="hover:bg-[#FAFAFA] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#09090B]">
                          {patientRow ? (
                            <Link
                              href={`/dentist/patients/${tx.patient_id}`}
                              className="hover:text-blue-600 transition-colors"
                            >
                              {patientRow.name}
                            </Link>
                          ) : (
                            <span className="text-[#71717A]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#52525B]">
                          <Link
                            href={`/dentist/treatments/${tx.id}`}
                            className="hover:text-blue-600 transition-colors"
                          >
                            {tx.treatment_type}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[#52525B]">
                          {tx.performed_at
                            ? formatDate(tx.performed_at)
                            : formatDate(tx.created_at)}
                        </td>
                        <td className="px-4 py-3 text-[#52525B]">
                          {formatCurrency(Number(tx.cost))}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={TREATMENT_STATUS_LABELS[tx.status as TreatmentStatus]}
                            variant={STATUS_VARIANT_MAP[tx.status as TreatmentStatus]}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/dentist/treatments/${tx.id}`} className={ACTION_BUTTON}>
                            <Eye className="h-3 w-3" aria-hidden />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[#71717A]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1 border border-[#E4E4E7] rounded-lg hover:bg-[#FAFAFA] text-[#09090B]"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1 border border-[#E4E4E7] rounded-lg hover:bg-[#FAFAFA] text-[#09090B]"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

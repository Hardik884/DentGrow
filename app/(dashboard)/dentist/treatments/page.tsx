import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { TreatmentFilters } from "@/components/dentist/TreatmentFilters";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getAllTreatments } from "@/actions/treatments";
import { createServerClient } from "@/lib/supabase/server";
import {
  TREATMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import type { Treatment, TreatmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Treatments — DentGrow",
};

interface Props {
  searchParams: Promise<{
    status?: string;
    search?: string;
    treatmentType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

const STATUS_VARIANT_MAP: Record<
  TreatmentStatus,
  "default" | "info" | "success" | "error"
> = {
  planned: "default",
  in_progress: "info",
  completed: "success",
  cancelled: "error",
};

/**
 * /dentist/treatments
 *
 * All treatments across the clinic — dentist view.
 * Full records with search/filter/pagination matching the Appointments page UX.
 */
export default async function DentistTreatmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  // Resolve today's date for the filter default (clinic timezone).
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let today = new Date().toISOString().split("T")[0];

  if (user) {
    const { data: profile } = await db
      .from("profiles")
      .select("clinic_id")
      .eq("id", user.id)
      .single();
    const clinicId = (profile as { clinic_id: string } | null)?.clinic_id;
    if (clinicId) {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      const tz = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      today = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

  const result = await getAllTreatments({
    page,
    limit,
    search: params.search,
    status: params.status || undefined,
    treatmentType: params.treatmentType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const treatments = (result.data?.treatments ?? []) as Treatment[];
  const total = result.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (params.status)        sp.set("status",        params.status);
    if (params.search)        sp.set("search",        params.search);
    if (params.treatmentType) sp.set("treatmentType", params.treatmentType);
    if (params.dateFrom)      sp.set("dateFrom",      params.dateFrom);
    if (params.dateTo)        sp.set("dateTo",        params.dateTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Treatments" />

      {/* ── Filters (client component, drives URL params) ──── */}
      <Suspense>
        <TreatmentFilters
          today={today}
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialTreatmentType={params.treatmentType ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* ── Results count ──────────────────────────────────── */}
      <p className="text-sm text-[#71717A]">
        {total} treatment{total !== 1 ? "s" : ""} found
      </p>

      {/* ── Error ─────────────────────────────────────────── */}
      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────── */}
      {treatments.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-[#71717A] text-sm">No treatments match your filters.</p>
          <p className="text-[#A1A1AA] text-xs mt-1">
            Try adjusting the date range or clearing filters.
          </p>
        </div>
      ) : (
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
                        <Link
                          href={`/dentist/treatments/${tx.id}`}
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
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
      )}

      {/* ── Pagination ─────────────────────────────────────── */}
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
    </div>
  );
}

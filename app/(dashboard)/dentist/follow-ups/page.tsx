import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layouts/PageHeader";
import { FollowUpFilters } from "@/components/follow-ups/FollowUpFilters";
import { OverdueFollowUpBadge } from "@/components/follow-ups/OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getAllFollowUps } from "@/actions/follow-ups";
import {
  formatDate,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
} from "@/lib/utils";
import type { FollowUpWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Follow-Ups — DentGrow",
};

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * /dentist/follow-ups
 *
 * Clinic-wide follow-up list with search, status filter, date range, and
 * pagination — matching the Appointments page UX exactly.
 */
export default async function DentistFollowUpsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  const result = await getAllFollowUps({
    page,
    limit,
    search: params.search,
    status: params.status as "pending" | "completed" | "cancelled" | "overdue" | undefined,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });

  const followUps = result.data?.followUps ?? [];
  const total = result.data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Compute today once for overdue detection
  const todayStr = new Date().toISOString().split("T")[0];
  const today = new Date(`${todayStr}T00:00:00`);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (params.search)   sp.set("search",   params.search);
    if (params.status)   sp.set("status",   params.status);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo)   sp.set("dateTo",   params.dateTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Follow-Ups"
        action={{ label: "+ New Follow-Up", href: "/dentist/follow-ups/new" }}
      />

      {/* ── Filters (client component, drives URL params) ──── */}
      <Suspense>
        <FollowUpFilters
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialDateFrom={params.dateFrom ?? ""}
          initialDateTo={params.dateTo ?? ""}
        />
      </Suspense>

      {/* ── Results count ──────────────────────────────────── */}
      <p className="text-sm text-[#71717A]">
        {total} follow-up{total !== 1 ? "s" : ""} found
      </p>

      {/* ── Error ─────────────────────────────────────────── */}
      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {/* ── Table ─────────────────────────────────────────── */}
      {followUps.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-[#71717A] text-sm">No follow-ups match your filters.</p>
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
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 sr-only">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {followUps.map((fu) => (
                  <FollowUpRow key={fu.id} fu={fu} today={today} />
                ))}
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

// =============================================================================
// FollowUpRow — single table row
// =============================================================================

function FollowUpRow({
  fu,
  today,
}: {
  fu: FollowUpWithRelations;
  today: Date;
}) {
  const dueDate = new Date(`${fu.due_date}T00:00:00`);
  const isOverdue = fu.status === "pending" && dueDate < today;
  const diffMs   = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const typeLabel =
    FOLLOW_UP_TYPE_LABELS[fu.follow_up_type ?? ""] ?? fu.follow_up_type ?? "Follow-up";

  return (
    <tr className="hover:bg-[#FAFAFA] transition-colors">
      {/* Patient */}
      <td className="px-4 py-3 font-medium text-[#09090B]">
        {fu.patient ? (
          <Link
            href={`/dentist/patients/${fu.patient_id}`}
            className="hover:text-blue-600 transition-colors"
          >
            {fu.patient.name}
          </Link>
        ) : (
          <span className="text-[#71717A]">—</span>
        )}
        {fu.patient?.phone && (
          <p className="text-xs text-[#71717A] font-normal mt-0.5">{fu.patient.phone}</p>
        )}
      </td>

      {/* Type */}
      <td className="px-4 py-3 text-[#52525B]">{typeLabel}</td>

      {/* Due Date */}
      <td className="px-4 py-3 text-[#52525B]">
        <div>{formatDate(fu.due_date)}</div>
        {fu.status === "pending" && isOverdue && (
          <span className="text-xs text-red-600 font-medium">
            {Math.abs(diffDays)}d overdue
          </span>
        )}
        {fu.status === "pending" && !isOverdue && (
          <span className="text-xs text-amber-600">
            {diffDays === 0 ? "Today" : `${diffDays}d remaining`}
          </span>
        )}
      </td>

      {/* Notes */}
      <td className="px-4 py-3 text-[#52525B] max-w-xs">
        {fu.notes ? (
          <span className="truncate block text-xs">{fu.notes}</span>
        ) : (
          <span className="text-[#A1A1AA]">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {isOverdue && <OverdueFollowUpBadge />}
          <StatusBadge
            label={FOLLOW_UP_STATUS_LABELS[fu.status]}
            variant={
              fu.status === "completed"
                ? "success"
                : fu.status === "cancelled"
                  ? "error"
                  : isOverdue
                    ? "error"
                    : "default"
            }
          />
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <Link
          href={`/dentist/follow-ups/${fu.id}`}
          className="text-blue-600 hover:underline text-xs font-medium"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

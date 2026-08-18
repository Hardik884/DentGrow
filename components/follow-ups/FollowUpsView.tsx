"use client";

/**
 * FollowUpsView
 *
 * Client view for the dentist Follow-Ups list. Backed by TanStack Query for
 * instant return navigation; `getAllFollowUps` stays the source of truth.
 * FollowUpFilters remains a separate client component that drives the URL.
 */

import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAllFollowUps } from "@/actions/follow-ups";
import { queryKeys } from "@/lib/query/keys";
import { ConfirmationStatusBadge } from "@/components/follow-ups/ConfirmationStatusBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { ACTION_BUTTON } from "@/lib/ui/action-styles";
import { Eye } from "lucide-react";
import {
  formatDate,
  followUpDisplayFromFlags,
  FOLLOW_UP_TYPE_LABELS,
} from "@/lib/utils";
import type { FollowUpWithRelations } from "@/types";

interface FollowUpsViewProps {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  confirmation?: string;
  treatmentType?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Clinic-local today ("YYYY-MM-DD"), computed server-side, for overdue detection. */
  clinicToday: string;
}

export function FollowUpsView({
  page,
  limit,
  search,
  status,
  confirmation,
  treatmentType,
  dateFrom,
  dateTo,
  clinicToday,
}: FollowUpsViewProps) {
  const { data, isPending, isError, error, isPlaceholderData, isFetching } =
    useQuery({
      queryKey: queryKeys.followUps.list({
        page,
        search: search ?? "",
        status: status ?? "",
        confirmation: confirmation ?? "",
        treatmentType: treatmentType ?? "",
        dateFrom: dateFrom ?? "",
        dateTo: dateTo ?? "",
      }),
      queryFn: async () => {
        const res = await getAllFollowUps({
          page,
          limit,
          search,
          status: status as
            | "pending"
            | "completed"
            | "cancelled"
            | "overdue"
            | undefined,
          confirmation: confirmation as "tentative" | "confirmed" | undefined,
          treatmentType,
          dateFrom,
          dateTo,
        });
        if (res.error) throw new Error(res.error);
        return res.data ?? { followUps: [], total: 0 };
      },
      placeholderData: keepPreviousData,
    });

  const followUps = data?.followUps ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Overdue detection uses the clinic-local today (passed from the server), not
  // the browser/UTC date — otherwise between local midnight and UTC midnight a
  // follow-up due today reads "Due in 1 day" and an overdue one isn't flagged
  // (audit: FollowUpsView UTC "today").
  const today = new Date(`${clinicToday}T00:00:00`);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (search)        sp.set("search",        search);
    if (status)        sp.set("status",        status);
    if (confirmation)  sp.set("confirmation",  confirmation);
    if (treatmentType) sp.set("treatmentType", treatmentType);
    if (dateFrom)      sp.set("dateFrom",      dateFrom);
    if (dateTo)        sp.set("dateTo",        dateTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  if (isPending) {
    return (
      <>
        <p className="text-sm text-[#737A76]">Loading follow-ups…</p>
        <ListTableSkeleton />
      </>
    );
  }

  return (
    <>
      {/* Results count */}
      <p className="text-sm text-[#737A76]">
        {total} follow-up{total !== 1 ? "s" : ""} found
      </p>

      {/* Error */}
      {isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {(error as Error)?.message ?? "Failed to load follow-ups."}
        </p>
      )}

      {/* Table */}
      {followUps.length === 0 ? (
        <div className="bg-white border border-[#E3E9E6] rounded-xl p-12 text-center">
          <p className="text-[#737A76] text-sm">No follow-ups match your filters.</p>
          <p className="text-[#9BA39D] text-xs mt-1">
            Try adjusting the date range or clearing filters.
          </p>
        </div>
      ) : (
        <div
          className={
            isPlaceholderData && isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="bg-white border border-[#E3E9E6] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#EEF2F0] bg-[#F6F8F6] text-left text-xs font-semibold text-[#737A76] uppercase tracking-wide">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F0]">
                  {followUps.map((fu) => (
                    <FollowUpRow key={fu.id} fu={fu} today={today} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[#737A76]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1 border border-[#E3E9E6] rounded-lg hover:bg-[#F6F8F6] text-[#151918]"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1 border border-[#E3E9E6] rounded-lg hover:bg-[#F6F8F6] text-[#151918]"
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
  const diffMs = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const typeLabel =
    FOLLOW_UP_TYPE_LABELS[fu.follow_up_type ?? ""] ?? fu.follow_up_type ?? "Follow-up";

  return (
    <tr className="hover:bg-[#F6F8F6] transition-colors">
      {/* Patient */}
      <td className="px-4 py-3 font-medium text-[#151918]">
        {fu.patient ? (
          <Link
            href={`/dentist/patients/${fu.patient_id}`}
            className="hover:text-blue-600 transition-colors"
          >
            {fu.patient.name}
          </Link>
        ) : (
          <span className="text-[#737A76]">—</span>
        )}
        {fu.patient?.phone && (
          <p className="text-xs text-[#737A76] font-normal mt-0.5">{fu.patient.phone}</p>
        )}
      </td>

      {/* Type */}
      <td className="px-4 py-3 text-[#5B635E]">{typeLabel}</td>

      {/* Due Date */}
      <td className="px-4 py-3 text-[#5B635E]">
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
      <td className="px-4 py-3 text-[#5B635E] max-w-xs">
        {fu.notes ? (
          <span className="truncate block text-xs">{fu.notes}</span>
        ) : (
          <span className="text-[#9BA39D]">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ConfirmationStatusBadge status={fu.confirmation_status} />
          {(() => {
            const d = followUpDisplayFromFlags(fu.status, isOverdue, diffDays === 0);
            return <StatusBadge label={d.label} variant={d.variant} />;
          })()}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <Link href={`/dentist/follow-ups/${fu.id}`} className={ACTION_BUTTON}>
          <Eye className="h-3 w-3" aria-hidden />
          View
        </Link>
      </td>
    </tr>
  );
}

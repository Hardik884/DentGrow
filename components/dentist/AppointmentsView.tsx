"use client";

/**
 * AppointmentsView
 *
 * Client view for the dentist Appointments list. Backed by TanStack Query so
 * return navigation is instant from cache; `getAppointments` stays the source
 * of truth. Filters (AppointmentFilters) remain a separate client component
 * that drives the URL — this view reads the resolved params as props.
 */

import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAppointments } from "@/actions/appointments";
import { queryKeys } from "@/lib/query/keys";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

interface AppointmentsViewProps {
  page: number;
  limit: number;
  clinicTimezone: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  timeFrom?: string;
  timeTo?: string;
}

export function AppointmentsView({
  page,
  limit,
  clinicTimezone,
  search,
  status,
  dateFrom,
  dateTo,
  timeFrom,
  timeTo,
}: AppointmentsViewProps) {
  const { data, isPending, isError, error, isPlaceholderData, isFetching } =
    useQuery({
      queryKey: queryKeys.appointments.list({
        page,
        search: search ?? "",
        status: status ?? "",
        dateFrom: dateFrom ?? "",
        dateTo: dateTo ?? "",
        timeFrom: timeFrom ?? "",
        timeTo: timeTo ?? "",
      }),
      queryFn: async () => {
        const res = await getAppointments({
          status: status as AppointmentStatus | undefined,
          search,
          dateFrom,
          dateTo,
          timeFrom,
          timeTo,
          page,
          limit,
        });
        if (res.error) throw new Error(res.error);
        return res.data ?? { appointments: [], total: 0 };
      },
      placeholderData: keepPreviousData,
    });

  const appointments = data?.appointments ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (status)   sp.set("status",   status);
    if (search)   sp.set("search",   search);
    if (dateFrom) sp.set("dateFrom", dateFrom);
    if (dateTo)   sp.set("dateTo",   dateTo);
    if (timeFrom) sp.set("timeFrom", timeFrom);
    if (timeTo)   sp.set("timeTo",   timeTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  if (isPending) {
    return (
      <>
        <p className="text-sm text-[#71717A]">Loading appointments…</p>
        <ListTableSkeleton />
      </>
    );
  }

  return (
    <>
      {/* Results count */}
      <p className="text-sm text-[#71717A]">
        {total} appointment{total !== 1 ? "s" : ""} found
      </p>

      {/* Error — previously cached rows remain visible below */}
      {isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {(error as Error)?.message ?? "Failed to load appointments."}
        </p>
      )}

      {/* Table */}
      {appointments.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-[#71717A] text-sm">No appointments match your filters.</p>
          <p className="text-[#A1A1AA] text-xs mt-1">Try adjusting the date range or clearing filters.</p>
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
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5]">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#09090B]">
                        <Link
                          href={`/dentist/patients/${appt.patient_id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {appt.patient.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#52525B]">
                        {formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)}
                      </td>
                      <td className="px-4 py-3 text-[#52525B]">{appt.duration_minutes} min</td>
                      <td className="px-4 py-3 text-[#52525B]">
                        {APPOINTMENT_SOURCE_LABELS[appt.source] ?? appt.source}
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={appt.status as AppointmentStatus} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dentist/appointments/${appt.id}`}
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
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

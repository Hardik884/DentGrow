"use client";

/**
 * AppointmentsView
 *
 * Client view for the dentist Appointments list. Backed by TanStack Query so
 * return navigation is instant from cache; `getAppointments` stays the source
 * of truth. Supports two presentations without changing routes:
 *   - List view (table) — the default.
 *   - Calendar view (month grid) — reuses the same server action + cache.
 *
 * The table shows a derived Payment Status (from existing treatment + payment
 * records) and inline Reschedule / Cancel actions beside View.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getAppointments } from "@/actions/appointments";
import { getAppointmentPaymentStatuses } from "@/actions/payments";
import { queryKeys } from "@/lib/query/keys";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { PaymentStatusBadge } from "@/components/shared/PaymentStatusBadge";
import { AppointmentRowActions } from "@/components/dentist/AppointmentRowActions";
import { AppointmentsCalendar } from "@/components/dentist/AppointmentsCalendar";
import { ListTableSkeleton } from "@/components/shared/ListTableSkeleton";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS, cn } from "@/lib/utils";
import { List, CalendarDays } from "lucide-react";
import type { AppointmentStatus } from "@/types";

interface AppointmentsViewProps {
  page: number;
  limit: number;
  clinicTimezone: string;
  clinicToday: string;
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
  clinicToday,
  search,
  status,
  dateFrom,
  dateTo,
  timeFrom,
  timeTo,
}: AppointmentsViewProps) {
  const [view, setView] = useState<"list" | "calendar">("list");

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

  const apptIds = appointments.map((a) => a.id);
  // Derive payment status for the visible rows in a single batched call.
  const { data: paymentStatuses } = useQuery({
    queryKey: ["appointment-payment-status", apptIds],
    queryFn: async () => {
      const res = await getAppointmentPaymentStatuses(apptIds);
      if (res.error) throw new Error(res.error);
      return res.data ?? {};
    },
    enabled: view === "list" && apptIds.length > 0,
    staleTime: 1000 * 60,
  });

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

  const toggle = (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-text-secondary">
        {total} appointment{total !== 1 ? "s" : ""} found
      </p>
      <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
        <button
          type="button"
          onClick={() => setView("list")}
          aria-pressed={view === "list"}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
            view === "list" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
          )}
        >
          <List className="h-3.5 w-3.5" aria-hidden />
          List
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          aria-pressed={view === "calendar"}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
            view === "calendar" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Calendar
        </button>
      </div>
    </div>
  );

  if (view === "calendar") {
    return (
      <div className="space-y-4">
        {toggle}
        <AppointmentsCalendar clinicTimezone={clinicTimezone} clinicToday={clinicToday} />
      </div>
    );
  }

  if (isPending) {
    return (
      <>
        {toggle}
        <ListTableSkeleton />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {toggle}

      {isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {(error as Error)?.message ?? "Failed to load appointments."}
        </p>
      )}

      {appointments.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-12 text-center">
          <p className="text-text-secondary text-sm">No appointments match your filters.</p>
          <p className="text-text-disabled text-xs mt-1">Try adjusting the date range or clearing filters.</p>
        </div>
      ) : (
        <div
          className={
            isPlaceholderData && isFetching ? "opacity-60 transition-opacity" : "transition-opacity"
          }
        >
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F4F4F5] bg-surface text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Treating Doctor</th>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F5]">
                  {appointments.map((appt) => (
                    <tr key={appt.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <Link
                          href={`/dentist/patients/${appt.patient_id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {appt.patient.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[#52525B]">
                        {appt.dentistName ? appt.dentistName : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#52525B]">
                        {formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={paymentStatuses?.[appt.id]} />
                      </td>
                      <td className="px-4 py-3 text-[#52525B]">
                        {APPOINTMENT_SOURCE_LABELS[appt.source] ?? appt.source}
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentStatusBadge status={appt.status as AppointmentStatus} />
                      </td>
                      <td className="px-4 py-3">
                        <AppointmentRowActions
                          appointmentId={appt.id}
                          scheduledAt={appt.scheduled_at}
                          status={appt.status as AppointmentStatus}
                          clinicToday={clinicToday}
                          viewHref={`/dentist/appointments/${appt.id}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1 border border-border rounded-lg hover:bg-surface text-text-primary"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1 border border-border rounded-lg hover:bg-surface text-text-primary"
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

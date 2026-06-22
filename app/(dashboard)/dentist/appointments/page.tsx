import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { AppointmentFilters } from "@/components/dentist/AppointmentFilters";
import { getAppointments } from "@/actions/appointments";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Appointments — DentGrow",
};

interface Props {
  searchParams: Promise<{
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    timeFrom?: string;
    timeTo?: string;
    page?: string;
  }>;
}

/**
 * /dentist/appointments
 *
 * Server Component — appointment list with status + date range + time filters.
 * AppointmentFilters is a client component that drives URL search params.
 * Timezone-aware: date boundaries are converted to UTC before querying.
 */
export default async function DentistAppointmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  // Fetch clinic timezone and appointments in parallel — previously sequential.
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicTimezone = "Asia/Kolkata";
  let today = new Date().toISOString().split("T")[0];

  // Resolve profile first (need clinicId for settings), then fetch timezone +
  // appointments in parallel to avoid a 3-query waterfall.
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
      clinicTimezone = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
      today = new Intl.DateTimeFormat("en-CA", {
        timeZone: clinicTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

  // getAppointments calls resolveSession() internally, but the Supabase SSR
  // client caches the session cookie for the request lifetime so auth.getUser()
  // is a cached read — not a new network round-trip.
  const result = await getAppointments({
    status: params.status as AppointmentStatus | undefined,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    timeFrom: params.timeFrom,
    timeTo: params.timeTo,
    page,
    limit,
  });

  const { appointments, total } = result.data ?? { appointments: [], total: 0 };
  const totalPages = Math.ceil(total / limit);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (params.status)   sp.set("status",   params.status);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo)   sp.set("dateTo",   params.dateTo);
    if (params.timeFrom) sp.set("timeFrom", params.timeFrom);
    if (params.timeTo)   sp.set("timeTo",   params.timeTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Appointments"
        action={{ label: "+ New Appointment", href: "/dentist/appointments/new" }}
      />

      {/* ── Filters (client component, drives URL params) ──── */}
      <Suspense>
        <AppointmentFilters
          today={today}
          initialStatus={params.status ?? ""}
          initialDateFrom={params.dateFrom ?? today}
          initialDateTo={params.dateTo ?? today}
          initialTimeFrom={params.timeFrom ?? ""}
          initialTimeTo={params.timeTo ?? ""}
        />
      </Suspense>

      {/* ── Results count ──────────────────────────────────── */}
      <p className="text-sm text-[#71717A]">
        {total} appointment{total !== 1 ? "s" : ""} found
      </p>

      {/* ── Table ─────────────────────────────────────────── */}
      {appointments.length === 0 ? (
        <div className="bg-white border border-[#E4E4E7] rounded-xl p-12 text-center">
          <p className="text-[#71717A] text-sm">No appointments match your filters.</p>
          <p className="text-[#A1A1AA] text-xs mt-1">Try adjusting the date range or clearing filters.</p>
        </div>
      ) : (
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
                  <tr
                    key={appt.id}
                    className="hover:bg-[#FAFAFA] transition-colors"
                  >
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
                    <td className="px-4 py-3 text-[#52525B]">
                      {appt.duration_minutes} min
                    </td>
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

import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
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
    page?: string;
    view?: "list" | "calendar";
  }>;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "checked_in", label: "Checked In" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

/**
 * /dentist/appointments
 *
 * Server Component — appointment list with status + date range filters.
 * Supports pagination. Dentist can create, view, and navigate to detail.
 */
export default async function DentistAppointmentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 20;

  // Fetch clinic timezone for correct date display
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicTimezone = "UTC";
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
      clinicTimezone = (settings as { timezone?: string } | null)?.timezone ?? "UTC";
      today = new Intl.DateTimeFormat("en-CA", {
        timeZone: clinicTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

  const result = await getAppointments({
    status: params.status as AppointmentStatus | undefined,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    page,
    limit,
  });

  const { appointments, total } = result.data ?? { appointments: [], total: 0 };
  const totalPages = Math.ceil(total / limit);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom);
    if (params.dateTo) sp.set("dateTo", params.dateTo);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Appointments"
        action={{ label: "+ New Appointment", href: "/dentist/appointments/new" }}
      />

      {/* ── Filters ────────────────────────────────────────────── */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        {/* Status */}
        <div className="space-y-1">
          <label htmlFor="status-filter" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Status
          </label>
          <select
            id="status-filter"
            name="status"
            defaultValue={params.status ?? ""}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div className="space-y-1">
          <label htmlFor="dateFrom" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            From
          </label>
          <input
            id="dateFrom"
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom ?? today}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500"
          />
        </div>

        {/* Date To */}
        <div className="space-y-1">
          <label htmlFor="dateTo" className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            To
          </label>
          <input
            id="dateTo"
            type="date"
            name="dateTo"
            defaultValue={params.dateTo ?? today}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Filter
        </button>
        <a
          href="/dentist/appointments"
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Reset
        </a>
      </form>

      {/* ── Results count ──────────────────────────────────────── */}
      <p className="text-sm text-gray-500">
        {total} appointment{total !== 1 ? "s" : ""} found
      </p>

      {/* ── Table ─────────────────────────────────────────────── */}
      {appointments.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center">
          <p className="text-gray-500 text-sm">No appointments match your filters.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Date &amp; Time</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 sr-only">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appointments.map((appt) => (
                  <tr
                    key={appt.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/dentist/patients/${appt.patient_id}`}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {appt.patient.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {appt.duration_minutes} min
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {APPOINTMENT_SOURCE_LABELS[appt.source] ?? appt.source}
                    </td>
                    <td className="px-4 py-3">
                      <AppointmentStatusBadge status={appt.status} />
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

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="px-3 py-1 border rounded-md hover:bg-gray-50"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(page + 1)}
                className="px-3 py-1 border rounded-md hover:bg-gray-50"
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


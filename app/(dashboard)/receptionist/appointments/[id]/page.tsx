import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/PageHeader";
import { CheckInButton } from "@/components/receptionist/CheckInButton";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { RescheduleReceptionistPanel } from "@/components/receptionist/RescheduleReceptionistPanel";
import { CancelAppointmentButton } from "@/components/shared/CancelAppointmentButton";
import { AppointmentHistoryTimeline } from "@/components/shared/AppointmentHistoryTimeline";
import { getAppointment } from "@/actions/appointments";
import { createServerClient } from "@/lib/supabase/server";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Appointment — DentGrow",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /receptionist/appointments/[id]
 *
 * Appointment detail — receptionist view.
 * Primary action: Check In (creates queue entry).
 * Secondary actions: Reschedule, Cancel.
 * No status advancement beyond check-in (dentist-only).
 * No internal_notes shown.
 */
export default async function ReceptionistAppointmentDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const result = await getAppointment(id);
  if (!result.data) notFound();

  const appt = result.data;
  const status = appt.status as AppointmentStatus;
  const isTerminal = ["completed", "cancelled", "no_show"].includes(status);
  const isCheckedIn = status === "checked_in";

  // Fetch clinic timezone for correct date/time display and RescheduleModal
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicTimezone = "Asia/Kolkata";
  let clinicToday: string | undefined;
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
      clinicToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: clinicTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader title="Appointment" backHref="/receptionist/appointments" />

      {/* ── Summary ──────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href={`/receptionist/patients/${appt.patient_id}`}
              className="text-lg font-semibold text-gray-900 hover:text-blue-600"
            >
              {appt.patient.name}
            </Link>
            {appt.patient.phone && (
              <p className="text-sm text-gray-500">{appt.patient.phone}</p>
            )}
          </div>
          <AppointmentStatusBadge status={status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date &amp; Time</p>
            <p className="font-semibold mt-0.5">{formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Duration</p>
            <p className="font-semibold mt-0.5">{appt.duration_minutes} min</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Source</p>
            <p className="font-semibold mt-0.5">
              {APPOINTMENT_SOURCE_LABELS[appt.source] ?? appt.source}
            </p>
          </div>
        </div>

        {appt.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{appt.notes}</p>
          </div>
        )}
      </div>

      {/* ── Actions ──────────────────────────────────────────── */}
      {!isTerminal && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
          <div className="flex flex-wrap gap-3">
            {/* Check-in — only for scheduled appointments */}
            {status === "scheduled" && (
              <CheckInButton
                appointmentId={appt.id}
                isCheckedIn={isCheckedIn}
              />
            )}
            {isCheckedIn && (
              <div className="px-4 py-2 bg-green-50 text-green-700 text-sm font-medium rounded-md border border-green-200">
                ✓ Checked In
              </div>
            )}

            {/* Reschedule */}
            <RescheduleReceptionistPanel
              appointmentId={appt.id}
              currentScheduledAt={appt.scheduled_at}
              clinicToday={clinicToday}
            />

            {/* Cancel */}
            <CancelAppointmentButton
              appointmentId={appt.id}
              redirectHref="/receptionist/appointments"
            />
          </div>
        </div>
      )}

      {/* ── History ──────────────────────────────────────────── */}
      <AppointmentHistoryTimeline history={appt.history} timezone={clinicTimezone} />
    </div>
  );
}

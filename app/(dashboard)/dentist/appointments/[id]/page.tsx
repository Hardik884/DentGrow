import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/PageHeader";
import { AppointmentStatusControl } from "@/components/dentist/AppointmentStatusControl";
import { AppointmentHistoryTimeline } from "@/components/shared/AppointmentHistoryTimeline";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { AppointmentTreatmentsSection } from "@/components/dentist/AppointmentTreatmentsSection";
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
 * /dentist/appointments/[id]
 *
 * Server Component — full appointment detail + lifecycle controls.
 *
 * Shows:
 * - Appointment metadata (patient, time, source, duration, notes)
 * - AppointmentStatusControl (advance/cancel/reschedule — client component)
 * - AppointmentHistoryTimeline (audit trail)
 * - Link to patient profile
 */
export default async function DentistAppointmentDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const result = await getAppointment(id);
  if (!result.data) notFound();

  const appt = result.data;

  // Fetch clinic timezone for correct date/time display and for RescheduleModal
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicTimezone = "UTC";
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
      clinicTimezone = (settings as { timezone?: string } | null)?.timezone ?? "UTC";
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
      <PageHeader title="Appointment" backHref="/dentist/appointments" />

      {/* ── Summary card ─────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href={`/dentist/patients/${appt.patient_id}`}
              className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
            >
              {appt.patient.name}
            </Link>
            {appt.patient.phone && (
              <p className="text-sm text-gray-500">{appt.patient.phone}</p>
            )}
          </div>
          <AppointmentStatusBadge status={appt.status as AppointmentStatus} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
          <Detail label="Date & Time" value={formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)} />
          <Detail label="Duration" value={`${appt.duration_minutes} min`} />
          <Detail
            label="Source"
            value={APPOINTMENT_SOURCE_LABELS[appt.source] ?? appt.source}
          />
          <Detail label="Patient" value={appt.patient.name} />
        </div>

        {appt.notes && (
          <div className="pt-4 border-t">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Notes
            </p>
            <p className="text-sm text-gray-700">{appt.notes}</p>
          </div>
        )}
      </div>

      {/* ── Status controls ──────────────────────────────────── */}
      <AppointmentStatusControl
        appointmentId={appt.id}
        currentStatus={appt.status as AppointmentStatus}
        currentScheduledAt={appt.scheduled_at}
        clinicToday={clinicToday}
      />

      {/* ── Treatments for this appointment ─────────────────── */}
      <AppointmentTreatmentsSection
        appointmentId={appt.id}
        patientId={appt.patient_id}
      />

      {/* ── Audit history timeline ───────────────────────────── */}
      <AppointmentHistoryTimeline history={appt.history} timezone={clinicTimezone} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

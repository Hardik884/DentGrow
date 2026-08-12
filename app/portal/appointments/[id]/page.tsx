import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppointment } from "@/actions/appointments";
import { createServerClient } from "@/lib/supabase/server";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { CancelAppointmentButton } from "@/components/shared/CancelAppointmentButton";
import { formatDateTimeInTimezone } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Appointment",
};

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * /portal/appointments/[id]
 *
 * Patient portal — appointment detail view.
 * RLS ensures the patient can only see their own appointment.
 * Cancel button visible if appointment is not in a terminal state.
 * No internal_notes, no audit history.
 */
export default async function PortalAppointmentDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  const result = await getAppointment(id);
  if (!result.data) notFound();

  const appt = result.data;
  const status = appt.status as AppointmentStatus;
  const isCancellable = ["scheduled", "checked_in"].includes(status);

  // Fetch clinic timezone for correct display of scheduled_at
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();

  let clinicTimezone = "Asia/Kolkata";

  if (user) {
    const { data: profile } = await db
      .from("patient_portal_links")
      .select("patient_id, patients!inner(clinic_id)")
      .eq("user_id", user.id)
      .single();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clinicId = (profile as any)?.patients?.clinic_id as string | undefined;
    if (clinicId) {
      const { data: settings } = await db
        .from("clinic_settings")
        .select("timezone")
        .eq("clinic_id", clinicId)
        .maybeSingle();
      clinicTimezone = (settings as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Appointment Details</h1>
        <AppointmentStatusBadge status={status} />
      </div>

      {/* ── Summary ──────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Date &amp; Time
            </p>
            <p className="font-semibold mt-0.5">
              {formatDateTimeInTimezone(appt.scheduled_at, clinicTimezone)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Duration
            </p>
            <p className="font-semibold mt-0.5">{appt.duration_minutes} min</p>
          </div>
        </div>
        {/* `appointments.notes` is a staff-internal field (clinical / back-office
            free text, auto-filled with follow-up reasons) and is deliberately
            NOT shown to patients — see audit A1. The patient branch of
            getAppointment no longer returns it. */}
      </div>

      {/* ── Cancel ───────────────────────────────────────────── */}
      {isCancellable && (
        <div className="flex justify-end">
          <CancelAppointmentButton
            appointmentId={appt.id}
            redirectHref="/portal/appointments"
          />
        </div>
      )}

      {["cancelled", "no_show"].includes(status) && (
        <p className="text-sm text-center text-gray-500">
          This appointment has been {status === "cancelled" ? "cancelled" : "marked as no-show"}.
        </p>
      )}
    </div>
  );
}

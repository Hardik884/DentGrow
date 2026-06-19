import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAppointment } from "@/actions/appointments";
import { AppointmentStatusBadge } from "@/components/shared/AppointmentStatusBadge";
import { CancelAppointmentButton } from "@/components/shared/CancelAppointmentButton";
import { formatDateTime } from "@/lib/utils";
import type { AppointmentStatus } from "@/types";

export const metadata: Metadata = {
  title: "Appointment — DentGrow",
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
              {formatDateTime(appt.scheduled_at)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Duration
            </p>
            <p className="font-semibold mt-0.5">{appt.duration_minutes} min</p>
          </div>
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

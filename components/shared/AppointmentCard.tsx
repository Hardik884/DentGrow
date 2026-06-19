import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppointment } from "@/actions/appointments";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import { formatDateTime, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import type { AppointmentWithPatient } from "@/types";

interface AppointmentCardProps {
  appointmentId?: string;
  appointment?: AppointmentWithPatient;
  /** When true, hides staff-only fields (patient name, source) */
  portalView?: boolean;
  /** Role-prefixed base href for "View" links e.g. "/dentist" */
  baseHref?: string;
}

/**
 * AppointmentCard
 *
 * Server Component — displays a single appointment summary.
 * Used by: dentist list, receptionist list, patient portal list.
 *
 * When `appointmentId` is provided without `appointment`, fetches the
 * appointment data server-side via getAppointment().
 *
 * portalView=true suppresses staff-only fields.
 */
export async function AppointmentCard({
  appointmentId,
  appointment: appointmentProp,
  portalView = false,
  baseHref,
}: AppointmentCardProps) {
  // Fetch if only ID is provided
  let appointment = appointmentProp;
  if (!appointment && appointmentId) {
    const result = await getAppointment(appointmentId);
    if (!result.data) notFound();
    appointment = result.data;
  }

  if (!appointment) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50 text-sm text-gray-400">
        Appointment not found.
      </div>
    );
  }

  const href = baseHref
    ? `${baseHref}/appointments/${appointment.id}`
    : undefined;

  const content = (
    <div className="border rounded-lg p-4 bg-white space-y-2 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!portalView && (
            <p className="font-semibold text-gray-900 truncate">
              {appointment.patient.name}
            </p>
          )}
          <p className="text-sm text-gray-700">
            {formatDateTime(appointment.scheduled_at)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {appointment.duration_minutes} min
            {!portalView && appointment.source
              ? ` · ${APPOINTMENT_SOURCE_LABELS[appointment.source] ?? appointment.source}`
              : ""}
          </p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>

      {appointment.notes && (
        <p className="text-sm text-gray-600 border-t pt-2 truncate">
          {appointment.notes}
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

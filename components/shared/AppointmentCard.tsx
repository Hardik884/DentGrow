import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppointment } from "@/actions/appointments";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import { formatDateTimeInTimezone, APPOINTMENT_SOURCE_LABELS } from "@/lib/utils";
import { PatientAvatar } from "./PatientAvatar";
import { Clock } from "lucide-react";
import type { AppointmentWithPatient } from "@/types";

interface AppointmentCardProps {
  appointmentId?: string;
  appointment?: AppointmentWithPatient;
  portalView?: boolean;
  baseHref?: string;
  timezone?: string;
}

export async function AppointmentCard({
  appointmentId,
  appointment: appointmentProp,
  portalView = false,
  baseHref,
  timezone = "UTC",
}: AppointmentCardProps) {
  let appointment = appointmentProp;
  if (!appointment && appointmentId) {
    const result = await getAppointment(appointmentId);
    if (!result.data) notFound();
    appointment = result.data;
  }

  if (!appointment) {
    return (
      <div className="px-5 py-4 text-sm text-[#71717A]">
        Appointment not found.
      </div>
    );
  }

  const href = baseHref ? `${baseHref}/appointments/${appointment.id}` : undefined;

  const content = (
    <div className="px-5 py-3.5 flex items-center gap-3 hover:bg-[#FAFAFA] transition-colors group">
      {!portalView && (
        <PatientAvatar name={appointment.patient.name} size="sm" />
      )}
      <div className="flex-1 min-w-0">
        {!portalView && (
          <p className="text-sm font-medium text-[#09090B] truncate">
            {appointment.patient.name}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5">
          <Clock className="h-3 w-3 text-[#A1A1AA] shrink-0" aria-hidden />
          <p className="text-xs text-[#71717A]">
            {formatDateTimeInTimezone(appointment.scheduled_at, timezone)}
            {" · "}
            {appointment.duration_minutes} min
            {!portalView && appointment.source
              ? ` · ${APPOINTMENT_SOURCE_LABELS[appointment.source] ?? appointment.source}`
              : ""}
          </p>
        </div>
        {appointment.chief_complaints && (
          <p className="text-xs text-[#A1A1AA] truncate mt-0.5">{appointment.chief_complaints}</p>
        )}
      </div>
      <AppointmentStatusBadge status={appointment.status} />
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

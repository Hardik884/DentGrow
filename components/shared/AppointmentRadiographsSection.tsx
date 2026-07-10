import { getAppointmentDocuments } from "@/actions/treatments";
import { RadiographicDocuments } from "@/components/shared/RadiographicDocuments";
import type { TreatmentDocument } from "@/types";

interface AppointmentRadiographsSectionProps {
  appointmentId: string;
  patientId: string;
  /** Staff can upload/remove; patients (portal) are view-only. */
  canManage?: boolean;
}

/**
 * AppointmentRadiographsSection
 *
 * Server Component — loads appointment-scoped radiographic documents (with
 * short-lived signed URLs) and renders the client manager.
 */
export async function AppointmentRadiographsSection({
  appointmentId,
  patientId,
  canManage = true,
}: AppointmentRadiographsSectionProps) {
  const result = await getAppointmentDocuments(appointmentId);
  const documents = (result.data ?? []) as Array<TreatmentDocument & { url: string | null }>;

  return (
    <RadiographicDocuments
      appointmentId={appointmentId}
      patientId={patientId}
      documents={documents}
      canManage={canManage}
    />
  );
}

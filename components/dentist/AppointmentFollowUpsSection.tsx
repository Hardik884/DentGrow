import { getFollowUpsForAppointment } from "@/actions/follow-ups";
import { ConfirmationStatusBadge } from "@/components/follow-ups/ConfirmationStatusBadge";
import { FollowUpFormDialog } from "@/components/follow-ups/FollowUpFormDialog";
import { formatDate } from "@/lib/utils";
import { FOLLOW_UP_TYPE_LABELS, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { FollowUpWithRelations } from "@/types";

interface AppointmentFollowUpsSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * AppointmentFollowUpsSection
 *
 * Server Component — follow-up appointments block on the appointment detail
 * page. Shows all follow-up appointments linked to this appointment. Clicking a
 * follow-up opens the shared inline Follow-up dialog (no navigation). Operational
 * "Add" actions are performed elsewhere in the workflow, so no create button is
 * shown here.
 */
export async function AppointmentFollowUpsSection({
  appointmentId,
  patientId,
  patientName,
}: AppointmentFollowUpsSectionProps) {
  const result = await getFollowUpsForAppointment(appointmentId);
  const followUps = (result.data ?? []) as FollowUpWithRelations[];

  return (
    <div className="bg-white border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Follow-up Appointments</h3>
          {followUps.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {followUps.length} follow-up appointment{followUps.length !== 1 ? "s" : ""} linked
            </p>
          )}
        </div>
        <FollowUpFormDialog
          patientId={patientId}
          patientName={patientName}
          appointmentId={appointmentId}
          triggerVariant="outline"
          triggerSize="sm"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add Follow-up Appointment
        </FollowUpFormDialog>
      </div>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      {followUps.length === 0 ? (
        <p className="text-sm text-gray-400">No follow-up appointments linked to this appointment.</p>
      ) : (
        <ul className="space-y-2">
          {followUps.map((fu) => (
            <li key={fu.id}>
              <FollowUpFormDialog
                followUpId={fu.id}
                initialData={fu}
                patientId={patientId}
                patientName={patientName}
                appointmentId={appointmentId}
                title="Follow-up Appointment"
                triggerClassName="w-full flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors group text-left"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">
                    {FOLLOW_UP_TYPE_LABELS[fu.follow_up_type] ?? fu.follow_up_type}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Due: {formatDate(fu.due_date)}
                    {fu.notes && (
                      <span className="ml-2 text-gray-400 truncate">— {fu.notes}</span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <ConfirmationStatusBadge status={fu.confirmation_status} />
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      fu.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : fu.status === "cancelled"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {FOLLOW_UP_STATUS_LABELS[fu.status] ?? fu.status}
                  </span>
                </span>
              </FollowUpFormDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

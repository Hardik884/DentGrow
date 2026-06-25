import Link from "next/link";
import { getFollowUpsForAppointment } from "@/actions/follow-ups";
import { formatDate } from "@/lib/utils";
import { FOLLOW_UP_TYPE_LABELS, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";
import type { FollowUpWithRelations } from "@/types";

interface AppointmentFollowUpsSectionProps {
  appointmentId: string;
  patientId: string;
  patientName: string;
}

/**
 * AppointmentFollowUpsSection
 *
 * Server Component — follow-ups block on the appointment detail page.
 * Shows all follow-ups linked to this appointment plus a "New Follow-Up" button
 * that returns to this appointment page after creation.
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Follow-Ups</h3>
          {followUps.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {followUps.length} follow-up{followUps.length !== 1 ? "s" : ""} linked
            </p>
          )}
        </div>
        <Link
          href={`/dentist/follow-ups/new?patient=${patientId}&patientName=${encodeURIComponent(patientName)}&appointment=${appointmentId}&back=/dentist/appointments/${appointmentId}`}
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          + New Follow-Up
        </Link>
      </div>

      {result.error && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}

      {followUps.length === 0 ? (
        <p className="text-sm text-gray-400">No follow-ups linked to this appointment.</p>
      ) : (
        <ul className="space-y-2">
          {followUps.map((fu) => (
            <li key={fu.id}>
              <Link
                href={`/dentist/follow-ups/${fu.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {FOLLOW_UP_TYPE_LABELS[fu.follow_up_type] ?? fu.follow_up_type}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Due: {formatDate(fu.due_date)}
                    {fu.notes && (
                      <span className="ml-2 text-gray-400 truncate">— {fu.notes}</span>
                    )}
                  </p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    fu.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : fu.status === "cancelled"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {FOLLOW_UP_STATUS_LABELS[fu.status] ?? fu.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

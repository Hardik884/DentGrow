import { formatDateTime } from "@/lib/utils";
import type { AppointmentHistory } from "@/types";

interface AppointmentHistoryTimelineProps {
  history: AppointmentHistory[];
}

const ACTION_LABELS: Record<string, string> = {
  created: "Appointment booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  status_changed: "Status updated",
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-blue-500",
  rescheduled: "bg-amber-500",
  cancelled: "bg-red-500",
  status_changed: "bg-green-500",
};

/**
 * AppointmentHistoryTimeline
 *
 * Read-only audit trail for an appointment.
 * Rendered on the dentist + receptionist appointment detail pages.
 * Patients never see this component.
 */
export function AppointmentHistoryTimeline({
  history,
}: AppointmentHistoryTimelineProps) {
  if (history.length === 0) {
    return (
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">History</h3>
        <p className="text-sm text-gray-500">No history recorded.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Appointment History
      </h3>

      <ol className="relative border-l border-gray-200 space-y-4 pl-4">
        {history.map((entry) => {
          const label =
            ACTION_LABELS[entry.action] ?? entry.action.replace("_", " ");
          const dotColor = ACTION_COLORS[entry.action] ?? "bg-gray-400";

          // Extract meaningful change description from old/new values
          const changeDescription = buildChangeDescription(entry);

          return (
            <li key={entry.id} className="relative pl-4">
              {/* Timeline dot */}
              <span
                className={`absolute left-[-9px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${dotColor}`}
                aria-hidden="true"
              />

              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                {changeDescription && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {changeDescription}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTime(entry.timestamp)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | Record<string, unknown>;

function buildChangeDescription(entry: AppointmentHistory): string | null {
  const oldVal = entry.old_value as Record<string, JsonValue> | null;
  const newVal = entry.new_value as Record<string, JsonValue> | null;

  if (entry.action === "status_changed" && oldVal?.status && newVal?.status) {
    return `${capitalise(String(oldVal.status).replace("_", " "))} → ${capitalise(String(newVal.status).replace("_", " "))}`;
  }

  if (entry.action === "rescheduled" && oldVal?.scheduled_at && newVal?.scheduled_at) {
    return `From ${formatDateTime(String(oldVal.scheduled_at))} → ${formatDateTime(String(newVal.scheduled_at))}`;
  }

  if (entry.action === "cancelled" && newVal?.reason) {
    return `Reason: ${String(newVal.reason)}`;
  }

  if (entry.action === "created" && newVal?.scheduled_at) {
    return `Scheduled for ${formatDateTime(String(newVal.scheduled_at))}`;
  }

  return null;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

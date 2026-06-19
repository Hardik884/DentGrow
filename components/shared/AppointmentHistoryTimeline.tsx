import { formatDateTime, formatDateTimeInTimezone } from "@/lib/utils";
import type { AppointmentHistory } from "@/types";

interface AppointmentHistoryTimelineProps {
  history: AppointmentHistory[];
  /** IANA timezone for the clinic. When provided, scheduled_at times in history
   *  are displayed in the clinic's local timezone (not browser/server local). */
  timezone?: string;
}

const ACTION_LABELS: Record<string, string> = {
  created: "Appointment booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  status_changed: "Status updated",
};

const ACTION_DOT: Record<string, string> = {
  created:       "bg-[#2563EB]",
  rescheduled:   "bg-[#CA8A04]",
  cancelled:     "bg-[#DC2626]",
  status_changed:"bg-[#16A34A]",
};

export function AppointmentHistoryTimeline({ history, timezone }: AppointmentHistoryTimelineProps) {
  if (history.length === 0) {
    return (
      <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#09090B] mb-2">History</h3>
        <p className="text-sm text-[#71717A]">No history recorded.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-[#09090B] mb-5">Appointment History</h3>

      <ol className="relative border-l border-[#E4E4E7] space-y-5 pl-5">
        {history.map((entry) => {
          const label = ACTION_LABELS[entry.action] ?? entry.action.replace("_", " ");
          const dotColor = ACTION_DOT[entry.action] ?? "bg-[#A1A1AA]";
          const changeDescription = buildChangeDescription(entry);

          return (
            <li key={entry.id} className="relative">
              <span
                className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-white ${dotColor}`}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-[#09090B]">{label}</p>
                {changeDescription && (
                  <p className="text-xs text-[#71717A] mt-0.5">{buildChangeDescription(entry, timezone)}</p>
                )}
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  {timezone ? formatDateTimeInTimezone(entry.timestamp, timezone) : formatDateTime(entry.timestamp)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type JsonValue = string | number | boolean | null | Record<string, unknown>;

function buildChangeDescription(entry: AppointmentHistory, timezone?: string): string | null {
  const fmt = (dt: string) =>
    timezone ? formatDateTimeInTimezone(dt, timezone) : formatDateTime(dt);

  const oldVal = entry.old_value as Record<string, JsonValue> | null;
  const newVal = entry.new_value as Record<string, JsonValue> | null;

  if (entry.action === "status_changed" && oldVal?.status && newVal?.status) {
    return `${cap(String(oldVal.status).replace("_", " "))} → ${cap(String(newVal.status).replace("_", " "))}`;
  }
  if (entry.action === "rescheduled" && oldVal?.scheduled_at && newVal?.scheduled_at) {
    return `From ${fmt(String(oldVal.scheduled_at))} → ${fmt(String(newVal.scheduled_at))}`;
  }
  if (entry.action === "cancelled" && newVal?.reason) {
    return `Reason: ${String(newVal.reason)}`;
  }
  if (entry.action === "created" && newVal?.scheduled_at) {
    return `Scheduled for ${fmt(String(newVal.scheduled_at))}`;
  }
  return null;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import Link from "next/link";
import { getFollowUpsForPatient } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "./OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";

interface PatientFollowUpsTabProps {
  patientId: string;
  /** base href — controls where "New" and detail links go */
  baseHref: string;
  /** role — controls whether create button is shown */
  role: "dentist" | "receptionist";
}

/**
 * PatientFollowUpsTab
 *
 * Server Component — follow-up timeline panel on patient profile pages.
 *
 * Shows:
 * - Upcoming follow-ups (pending, not overdue)
 * - Overdue follow-ups (pending, due_date < today) — highlighted in red
 * - Completed follow-ups (most recent first)
 * - Cancelled follow-ups (collapsed at bottom)
 *
 * Dentist: sees "+ New Follow-Up" button and follow-up detail links.
 * Receptionist: sees follow-ups but cannot create from patient profile.
 */
export async function PatientFollowUpsTab({
  patientId,
  baseHref,
  role,
}: PatientFollowUpsTabProps) {
  const result = await getFollowUpsForPatient(patientId);
  const followUps = result.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue = followUps.filter(
    (f) => f.status === "pending" && new Date(f.due_date) < today
  );
  const upcoming = followUps.filter(
    (f) => f.status === "pending" && new Date(f.due_date) >= today
  );
  const completed = followUps.filter((f) => f.status === "completed");
  const cancelled = followUps.filter((f) => f.status === "cancelled");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Follow-Ups</h3>
          {followUps.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {followUps.length} total ·{" "}
              {overdue.length > 0 && (
                <span className="text-red-600 font-medium">{overdue.length} overdue · </span>
              )}
              {upcoming.length} upcoming · {completed.length} completed
            </p>
          )}
        </div>
        {role === "dentist" && (
          <Link
            href={`${baseHref}/follow-ups/new?patient=${patientId}`}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            + New Follow-Up
          </Link>
        )}
      </div>

      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {followUps.length === 0 ? (
        <div className="bg-white border rounded-lg px-4 py-8 text-center">
          <p className="text-sm text-gray-500">No follow-ups recorded for this patient.</p>
          {role === "dentist" && (
            <Link
              href={`${baseHref}/follow-ups/new?patient=${patientId}`}
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              Create the first follow-up
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          {overdue.length > 0 && (
            <TimelineSection title="Overdue" titleClass="text-red-600">
              {overdue.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpTimelineRow
                    key={f.id}
                    id={f.id}
                    notes={f.notes}
                    dueDate={f.due_date}
                    updatedAt={f.updated_at}
                    status={f.status}
                    isOverdue
                    diffLabel={`${diffDays} day${diffDays !== 1 ? "s" : ""} overdue`}
                    baseHref={baseHref}
                  />
                );
              })}
            </TimelineSection>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <TimelineSection title="Upcoming">
              {upcoming.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpTimelineRow
                    key={f.id}
                    id={f.id}
                    notes={f.notes}
                    dueDate={f.due_date}
                    updatedAt={f.updated_at}
                    status={f.status}
                    diffLabel={
                      diffDays === 0
                        ? "Due today"
                        : `${diffDays} day${diffDays !== 1 ? "s" : ""} remaining`
                    }
                    baseHref={baseHref}
                  />
                );
              })}
            </TimelineSection>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <TimelineSection title="Completed">
              {completed.map((f) => (
                <FollowUpTimelineRow
                  key={f.id}
                  id={f.id}
                  notes={f.notes}
                  dueDate={f.due_date}
                  updatedAt={f.updated_at}
                  status={f.status}
                  baseHref={baseHref}
                />
              ))}
            </TimelineSection>
          )}

          {/* Cancelled */}
          {cancelled.length > 0 && (
            <TimelineSection title="Cancelled" titleClass="text-gray-400">
              {cancelled.map((f) => (
                <FollowUpTimelineRow
                  key={f.id}
                  id={f.id}
                  notes={f.notes}
                  dueDate={f.due_date}
                  updatedAt={f.updated_at}
                  status={f.status}
                  baseHref={baseHref}
                />
              ))}
            </TimelineSection>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimelineSection({
  title,
  titleClass = "text-gray-700",
  children,
}: {
  title: string;
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${titleClass}`}>
        {title}
      </p>
      <div className="bg-white border rounded-lg divide-y">{children}</div>
    </div>
  );
}

function FollowUpTimelineRow({
  id,
  notes,
  dueDate,
  updatedAt,
  status,
  isOverdue = false,
  diffLabel,
  baseHref,
}: {
  id: string;
  notes: string | null;
  dueDate: string;
  updatedAt: string;
  status: "pending" | "completed" | "cancelled";
  isOverdue?: boolean;
  diffLabel?: string;
  baseHref: string;
}) {
  return (
    <Link
      href={`${baseHref}/follow-ups/${id}`}
      className="flex items-start justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">
          {notes ?? "Follow-up"}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Due {formatDate(dueDate)}
          {status === "completed" && (
            <span className="text-green-600 ml-2">
              · Completed {formatDate(updatedAt)}
            </span>
          )}
          {diffLabel && (
            <span
              className={`ml-2 font-medium ${
                isOverdue ? "text-red-600" : "text-amber-600"
              }`}
            >
              · {diffLabel}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isOverdue && <OverdueFollowUpBadge />}
        <StatusBadge
          label={FOLLOW_UP_STATUS_LABELS[status]}
          variant={
            status === "completed"
              ? "success"
              : status === "cancelled"
                ? "error"
                : isOverdue
                  ? "error"
                  : "default"
          }
        />
      </div>
    </Link>
  );
}

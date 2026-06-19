import Link from "next/link";
import { getFollowUpsForPatient, getAllFollowUps } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "./OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";
import type { FollowUp } from "@/types";

interface FollowUpListProps {
  /** If provided, shows follow-ups for this specific patient only. */
  patientId?: string;
  /** If provided, shows only follow-ups with this status. Use 'overdue' for overdue filter. */
  statusFilter?: "pending" | "completed" | "cancelled" | "overdue";
  /** Whether to show a link to the patient name (used in clinic-wide list) */
  showPatientLink?: boolean;
  /** base href for the follow-up detail link (default: /dentist) */
  baseHref?: string;
}

type FollowUpWithPatient = FollowUp & {
  patient?: { id: string; name: string } | null;
};

/**
 * FollowUpList
 *
 * Server Component — renders follow-ups for:
 *   - A specific patient profile (patientId prop)
 *   - Clinic-wide list with optional status filter (no patientId)
 *
 * Overdue follow-ups (status = pending AND due_date < today) are highlighted
 * with a red badge and shown with days-overdue count.
 * Upcoming pending follow-ups show days remaining.
 * Completed follow-ups show the completion date (updated_at).
 */
export async function FollowUpList({
  patientId,
  statusFilter,
  showPatientLink = false,
  baseHref = "/dentist",
}: FollowUpListProps) {
  let followUps: FollowUpWithPatient[] = [];

  if (patientId) {
    const result = await getFollowUpsForPatient(patientId);
    followUps = (result.data ?? []) as FollowUpWithPatient[];
  } else {
    const result = await getAllFollowUps({ status: statusFilter, limit: 100 });
    followUps = result.data?.followUps ?? [];
  }

  // Sort: overdue first, then by due_date ascending
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...followUps].sort((a, b) => {
    const aOverdue = a.status === "pending" && new Date(a.due_date) < today;
    const bOverdue = b.status === "pending" && new Date(b.due_date) < today;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return (
    <div className="bg-white border rounded-lg divide-y">
      <div className="px-4 py-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Follow-Ups</h2>
        {patientId && (
          <Link
            href={`${baseHref}/follow-ups/new?patient=${patientId}`}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            + New
          </Link>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500 text-center">No follow-ups found.</p>
      ) : (
        <ul className="divide-y">
          {sorted.map((followUp) => (
            <FollowUpRow
              key={followUp.id}
              followUp={followUp}
              today={today}
              showPatientLink={showPatientLink}
              baseHref={baseHref}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// FollowUpRow — single row in the list
// -----------------------------------------------------------------------------

function FollowUpRow({
  followUp,
  today,
  showPatientLink,
  baseHref,
}: {
  followUp: FollowUpWithPatient;
  today: Date;
  showPatientLink: boolean;
  baseHref: string;
}) {
  const dueDate = new Date(followUp.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const isOverdue = followUp.status === "pending" && dueDate < today;
  const diffMs = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return (
    <li className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <Link href={`${baseHref}/follow-ups/${followUp.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          {/* Left: notes + patient + date */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {followUp.notes ?? "Follow-up"}
            </p>

            {showPatientLink && followUp.patient && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {followUp.patient.name}
              </p>
            )}

            <p className="text-xs text-gray-500 mt-0.5">
              Due {formatDate(followUp.due_date)}
              {followUp.status === "completed" && followUp.updated_at && (
                <span className="text-green-600 ml-2">
                  · Completed {formatDate(followUp.updated_at)}
                </span>
              )}
              {followUp.status === "pending" && isOverdue && (
                <span className="text-red-600 ml-2">
                  · {Math.abs(diffDays)} day{Math.abs(diffDays) !== 1 ? "s" : ""} overdue
                </span>
              )}
              {followUp.status === "pending" && !isOverdue && diffDays >= 0 && (
                <span className="text-amber-600 ml-2">
                  · {diffDays === 0 ? "Due today" : `${diffDays} day${diffDays !== 1 ? "s" : ""} remaining`}
                </span>
              )}
            </p>
          </div>

          {/* Right: badges */}
          <div className="flex items-center gap-2 shrink-0">
            {isOverdue && <OverdueFollowUpBadge />}
            <StatusBadge
              label={FOLLOW_UP_STATUS_LABELS[followUp.status]}
              variant={
                followUp.status === "completed"
                  ? "success"
                  : followUp.status === "cancelled"
                    ? "error"
                    : isOverdue
                      ? "error"
                      : "default"
              }
            />
          </div>
        </div>
      </Link>
    </li>
  );
}

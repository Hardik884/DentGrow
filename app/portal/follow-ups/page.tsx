import type { Metadata } from "next";
import { getPatientPortalFollowUps } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "@/components/follow-ups/OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Follow-Ups — DentGrow",
};

/**
 * /portal/follow-ups
 *
 * Patient portal — view own follow-ups only.
 * RLS enforced: only the authenticated patient's follow-ups are returned.
 * Patients cannot create or modify follow-ups — read-only.
 */
export default async function PortalFollowUpsPage() {
  const result = await getPatientPortalFollowUps();
  const followUps = result.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pending = followUps.filter((f) => f.status === "pending");
  const overdue = pending.filter((f) => new Date(f.due_date) < today);
  const upcoming = pending.filter((f) => new Date(f.due_date) >= today);
  const completed = followUps.filter((f) => f.status === "completed");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">My Follow-Ups</h1>

      {result.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {followUps.length === 0 ? (
        <div className="bg-white border rounded-lg px-6 py-12 text-center">
          <p className="text-gray-500 text-sm">No follow-ups on record.</p>
          <p className="text-gray-400 text-xs mt-1">
            Your dentist will create follow-ups when needed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Pending" value={pending.length} />
            <SummaryCard label="Overdue" value={overdue.length} valueClass="text-red-600" />
            <SummaryCard label="Completed" value={completed.length} valueClass="text-green-600" />
          </div>

          {/* Overdue */}
          {overdue.length > 0 && (
            <Section title="Overdue" titleClass="text-red-600">
              {overdue.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpCard
                    key={f.id}
                    notes={f.notes}
                    dueDate={f.due_date}
                    updatedAt={f.updated_at}
                    status={f.status}
                    isOverdue
                    label={`${diffDays} day${diffDays !== 1 ? "s" : ""} overdue`}
                  />
                );
              })}
            </Section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <Section title="Upcoming">
              {upcoming.map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const diffDays = Math.ceil(
                  (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );
                return (
                  <FollowUpCard
                    key={f.id}
                    notes={f.notes}
                    dueDate={f.due_date}
                    updatedAt={f.updated_at}
                    status={f.status}
                    label={diffDays === 0 ? "Due today" : `${diffDays} day${diffDays !== 1 ? "s" : ""} remaining`}
                  />
                );
              })}
            </Section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <Section title="Completed">
              {completed.map((f) => (
                <FollowUpCard
                  key={f.id}
                  notes={f.notes}
                  dueDate={f.due_date}
                  updatedAt={f.updated_at}
                  status={f.status}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border rounded-lg p-3 text-center">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  titleClass = "text-gray-700",
  children,
}: {
  title: string;
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{title}</p>
      <div className="bg-white border rounded-lg divide-y">{children}</div>
    </div>
  );
}

function FollowUpCard({
  notes,
  dueDate,
  updatedAt,
  status,
  isOverdue = false,
  label,
}: {
  notes: string | null;
  dueDate: string;
  updatedAt: string;
  status: "pending" | "completed" | "cancelled";
  isOverdue?: boolean;
  label?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{notes ?? "Follow-up"}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Due {formatDate(dueDate)}
            {status === "completed" && (
              <span className="text-green-600 ml-2">
                · Completed {formatDate(updatedAt)}
              </span>
            )}
            {label && (
              <span
                className={`ml-2 font-medium ${
                  isOverdue ? "text-red-600" : "text-amber-600"
                }`}
              >
                · {label}
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
      </div>
    </div>
  );
}

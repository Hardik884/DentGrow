import type { Metadata } from "next";
import { getPatientPortalFollowUps, getPortalToday } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "@/components/follow-ups/OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { daysBetween, formatDate, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Follow-Ups",
};

/**
 * /portal/follow-ups
 *
 * Patient portal — view own follow-ups only.
 * RLS enforced: only the authenticated patient's follow-ups are returned.
 * Patients cannot create or modify follow-ups — read-only.
 */
export default async function PortalFollowUpsPage() {
  const [result, todayResult] = await Promise.all([
    getPatientPortalFollowUps(),
    getPortalToday(),
  ]);
  const followUps = result.data ?? [];
  // Clinic-local "today" — see getPortalToday for why this can no longer be
  // computed as `new Date()` at render time.
  const today = todayResult.data ?? "";

  const pending = followUps.filter((f) => f.status === "pending");
  const overdue = pending.filter((f) => f.due_date < today);
  const upcoming = pending.filter((f) => f.due_date >= today);
  const completed = followUps.filter((f) => f.status === "completed");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">My Follow-Ups</h1>

      {result.error && (
        <p className="text-sm text-danger bg-danger-bg border border-danger-border rounded-md px-3 py-2">
          {result.error}
        </p>
      )}

      {followUps.length === 0 ? (
        <div className="bg-surface border rounded-lg px-6 py-12 text-center">
          <p className="text-text-secondary text-sm">No follow-ups on record.</p>
          <p className="text-text-disabled text-xs mt-1">
            Your dentist will create follow-ups when needed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Pending" value={pending.length} />
            <SummaryCard label="Overdue" value={overdue.length} valueClass="text-danger" />
            <SummaryCard label="Completed" value={completed.length} valueClass="text-success" />
          </div>

          {/* Overdue */}
          {overdue.length > 0 && (
            <Section title="Overdue" titleClass="text-danger">
              {overdue.map((f) => {
                const diffDays = daysBetween(f.due_date, today);
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
                const diffDays = daysBetween(today, f.due_date);
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
  valueClass = "text-text-primary",
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface border rounded-lg p-3 text-center">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  titleClass = "text-text-secondary",
  children,
}: {
  title: string;
  titleClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{title}</p>
      <div className="bg-surface border rounded-lg divide-y">{children}</div>
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
          <p className="text-sm font-medium text-text-primary">{notes ?? "Follow-up"}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Due {formatDate(dueDate)}
            {status === "completed" && (
              <span className="text-success ml-2">
                · Completed {formatDate(updatedAt)}
              </span>
            )}
            {label && (
              <span
                className={`ml-2 font-medium ${
                  isOverdue ? "text-danger" : "text-warning"
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


import Link from "next/link";
import { getFollowUpStats, getAllFollowUps } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "./OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  formatDate,
  formatDateTime,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
} from "@/lib/utils";
import { Calendar, Stethoscope } from "lucide-react";
import type { FollowUpWithRelations } from "@/types";

/**
 * FollowUpDashboard
 *
 * Server Component — clinic-wide follow-up overview for /dentist/follow-ups.
 *
 * Displays:
 * - KPI stat cards: pending, overdue, upcoming, completed
 * - Overdue list (highlighted, shown first)
 * - Upcoming follow-ups
 * - Recently completed follow-ups
 *
 * Each row now shows:
 * - Follow-up type
 * - Patient name + phone
 * - Due date with overdue/remaining context
 * - Linked appointment date (if present)
 * - Linked treatment name (if present)
 */
export async function FollowUpDashboard() {
  const [statsResult, overdueResult, upcomingResult, completedResult] =
    await Promise.all([
      getFollowUpStats(),
      getAllFollowUps({ status: "overdue", limit: 10 }),
      getAllFollowUps({ status: "pending", limit: 10 }),
      getAllFollowUps({ status: "completed", limit: 5 }),
    ]);

  const stats   = statsResult.data ?? { pending: 0, overdue: 0, completed: 0, upcoming: 0 };
  const overdue = overdueResult.data?.followUps ?? [];
  const today   = new Date();
  today.setHours(0, 0, 0, 0);

  // Upcoming: pending but NOT overdue
  const upcoming  = (upcomingResult.data?.followUps ?? []).filter(
    (f) => new Date(f.due_date) >= today
  );
  const completed = completedResult.data?.followUps ?? [];

  return (
    <div className="space-y-8">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending"   value={stats.pending}   description="Total open follow-ups" variant="default" />
        <StatCard label="Overdue"   value={stats.overdue}   description="Past due date"         variant="error" />
        <StatCard label="Upcoming"  value={stats.upcoming}  description="Due today or later"    variant="warning" />
        <StatCard label="Completed" value={stats.completed} description="All time"              variant="success" />
      </div>

      {/* ── Overdue Follow-Ups ── */}
      {overdue.length > 0 && (
        <Section title="Overdue" href="/dentist/follow-ups?status=overdue" count={stats.overdue}>
          <FollowUpTable followUps={overdue} today={today} />
        </Section>
      )}

      {/* ── Upcoming Follow-Ups ── */}
      {upcoming.length > 0 && (
        <Section title="Upcoming" href="/dentist/follow-ups?status=pending" count={stats.upcoming}>
          <FollowUpTable followUps={upcoming} today={today} />
        </Section>
      )}

      {/* Empty state */}
      {overdue.length === 0 && upcoming.length === 0 && (
        <div className="bg-white border border-border rounded-xl px-6 py-12 text-center">
          <p className="text-text-secondary text-sm">No pending follow-ups. All caught up!</p>
        </div>
      )}

      {/* ── Recently Completed ── */}
      {completed.length > 0 && (
        <Section title="Recently Completed" href="/dentist/follow-ups?status=completed">
          <FollowUpTable followUps={completed} today={today} />
        </Section>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatCard({
  label,
  value,
  description,
  variant,
}: {
  label: string;
  value: number;
  description: string;
  variant: "default" | "error" | "warning" | "success";
}) {
  const colorMap = {
    default: "text-text-primary",
    error:   "text-danger",
    warning: "text-amber-600",
    success: "text-success",
  };

  return (
    <div className="bg-white border border-border rounded-xl p-4 space-y-1">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${colorMap[variant]}`}>{value}</p>
      <p className="text-xs text-text-secondary">{description}</p>
    </div>
  );
}

function Section({
  title,
  href,
  count,
  children,
}: {
  title: string;
  href?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text-primary">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-text-secondary">({count})</span>
          )}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-blue-600 hover:underline underline-offset-4">
            View all
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function FollowUpTable({
  followUps,
  today,
}: {
  followUps: FollowUpWithRelations[];
  today: Date;
}) {
  return (
    <div className="bg-white border border-border rounded-xl divide-y divide-border overflow-hidden">
      {followUps.map((f) => {
        const dueDate = new Date(f.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const isOverdue = f.status === "pending" && dueDate < today;
        const diffMs   = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const followUpType: string = f.follow_up_type ?? "";
        const typeLabel = FOLLOW_UP_TYPE_LABELS[followUpType] ?? followUpType ?? "Follow-up";

        return (
          <Link
            key={f.id}
            href={`/dentist/follow-ups/${f.id}`}
            className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-[#FAFAFA] transition-colors"
          >
            {/* Left: info */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Type + patient */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-text-primary">{typeLabel}</span>
                {f.patient && (
                  <>
                    <span className="text-text-secondary text-xs">·</span>
                    <span className="text-xs font-medium text-blue-700">{f.patient.name}</span>
                    {f.patient.phone && (
                      <span className="text-xs text-text-secondary hidden sm:inline">
                        {f.patient.phone}
                      </span>
                    )}
                  </>
                )}
              </div>

              {/* Due date + urgency */}
              <p className="text-xs text-text-secondary">
                Due {formatDate(f.due_date)}
                {f.status === "pending" && isOverdue && (
                  <span className="text-danger font-medium ml-2">
                    · {Math.abs(diffDays)}d overdue
                  </span>
                )}
                {f.status === "pending" && !isOverdue && (
                  <span className="text-amber-600 ml-2">
                    · {diffDays === 0 ? "Today" : `${diffDays}d remaining`}
                  </span>
                )}
                {f.status === "completed" && f.updated_at && (
                  <span className="text-success ml-2">
                    · Completed {formatDate(f.updated_at)}
                  </span>
                )}
              </p>

              {/* Notes */}
              {f.notes && (
                <p className="text-xs text-text-secondary truncate max-w-sm">{f.notes}</p>
              )}

              {/* Related appointment + treatment */}
              {(f.appointment || f.treatment) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {f.appointment && (
                    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                      <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                      {formatDateTime(f.appointment.scheduled_at)}
                    </span>
                  )}
                  {f.treatment && (
                    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                      <Stethoscope className="h-3 w-3 shrink-0" aria-hidden />
                      {f.treatment.treatment_type}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: badges */}
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              {isOverdue && <OverdueFollowUpBadge />}
              <StatusBadge
                label={FOLLOW_UP_STATUS_LABELS[f.status]}
                variant={
                  f.status === "completed"
                    ? "success"
                    : f.status === "cancelled"
                      ? "error"
                      : isOverdue
                        ? "error"
                        : "default"
                }
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

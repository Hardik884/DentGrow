import Link from "next/link";
import { getFollowUpStats, getAllFollowUps } from "@/actions/follow-ups";
import { OverdueFollowUpBadge } from "./OverdueFollowUpBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, FOLLOW_UP_STATUS_LABELS } from "@/lib/utils";
import type { FollowUp } from "@/types";

type FollowUpWithPatient = FollowUp & {
  patient: { id: string; name: string } | null;
};

/**
 * FollowUpDashboard
 *
 * Server Component — clinic-wide follow-up overview for /dentist/follow-ups.
 *
 * Displays:
 * - KPI stat cards: pending, overdue, upcoming, completed
 * - Overdue list (highlighted, shown first)
 * - Upcoming follow-ups
 */
export async function FollowUpDashboard() {
  const [statsResult, overdueResult, upcomingResult, completedResult] =
    await Promise.all([
      getFollowUpStats(),
      getAllFollowUps({ status: "overdue", limit: 10 }),
      getAllFollowUps({ status: "pending", limit: 10 }),
      getAllFollowUps({ status: "completed", limit: 5 }),
    ]);

  const stats = statsResult.data ?? { pending: 0, overdue: 0, completed: 0, upcoming: 0 };
  const overdue = overdueResult.data?.followUps ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter upcoming: pending follow-ups NOT overdue
  const upcoming = (upcomingResult.data?.followUps ?? []).filter(
    (f) => new Date(f.due_date) >= today
  );
  const completed = completedResult.data?.followUps ?? [];

  return (
    <div className="space-y-8">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending"
          value={stats.pending}
          description="Total open follow-ups"
          variant="default"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          description="Past due date"
          variant="error"
        />
        <StatCard
          label="Upcoming"
          value={stats.upcoming}
          description="Due today or later"
          variant="warning"
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          description="All time"
          variant="success"
        />
      </div>

      {/* ── Overdue Follow-Ups ── */}
      {overdue.length > 0 && (
        <Section
          title="Overdue"
          href="/dentist/follow-ups?status=overdue"
          count={stats.overdue}
        >
          <FollowUpTable followUps={overdue} today={today} />
        </Section>
      )}

      {/* ── Upcoming Follow-Ups ── */}
      {upcoming.length > 0 && (
        <Section
          title="Upcoming"
          href="/dentist/follow-ups?status=pending"
          count={stats.upcoming}
        >
          <FollowUpTable followUps={upcoming} today={today} />
        </Section>
      )}

      {/* Empty state */}
      {overdue.length === 0 && upcoming.length === 0 && (
        <div className="bg-white border rounded-lg px-6 py-12 text-center">
          <p className="text-gray-500 text-sm">No pending follow-ups. All caught up!</p>
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
    default: "text-gray-900",
    error: "text-red-600",
    warning: "text-amber-600",
    success: "text-green-600",
  };

  return (
    <div className="bg-white border rounded-lg p-4 space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${colorMap[variant]}`}>{value}</p>
      <p className="text-xs text-gray-400">{description}</p>
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
        <h2 className="font-semibold text-gray-900">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-gray-500">({count})</span>
          )}
        </h2>
        {href && (
          <Link href={href} className="text-xs text-blue-600 hover:underline">
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
  followUps: FollowUpWithPatient[];
  today: Date;
}) {
  return (
    <div className="bg-white border rounded-lg divide-y">
      {followUps.map((f) => {
        const dueDate = new Date(f.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const isOverdue = f.status === "pending" && dueDate < today;
        const diffMs = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return (
          <Link
            key={f.id}
            href={`/dentist/follow-ups/${f.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {f.notes ?? "Follow-up"}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {f.patient && (
                  <span className="text-xs text-gray-500">{f.patient.name}</span>
                )}
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500">Due {formatDate(f.due_date)}</span>
                {f.status === "pending" && isOverdue && (
                  <span className="text-xs text-red-600 font-medium">
                    {Math.abs(diffDays)}d overdue
                  </span>
                )}
                {f.status === "pending" && !isOverdue && (
                  <span className="text-xs text-amber-600">
                    {diffDays === 0 ? "Today" : `${diffDays}d remaining`}
                  </span>
                )}
                {f.status === "completed" && f.updated_at && (
                  <span className="text-xs text-green-600">
                    Completed {formatDate(f.updated_at)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-4">
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getAppointments } from "@/actions/appointments";
import { getPatientTreatments } from "@/actions/treatments";
import { getPatientPortalFollowUps } from "@/actions/follow-ups";
import { getPortalOutstandingBalance } from "@/actions/payments";
import { getQueueStatus } from "@/actions/queue";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  formatCurrency,
  TREATMENT_STATUS_LABELS,
} from "@/lib/utils";
import {
  CalendarDays,
  ArrowRight,
  Bell,
  Stethoscope,
  CreditCard,
  Plus,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import type { TreatmentStatus } from "@/types";

// ─────────────────────────────────────────────────────────────
// Sub-components — keep the same visual language as DashboardKPIs
// ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  href?: string;
  accent?: "default" | "danger" | "success" | "warning";
}

function StatCard({ label, value, sub, icon, href, accent = "default" }: StatCardProps) {
  const accentIcon: Record<string, string> = {
    default: "bg-[#F4F4F5] text-[#71717A]",
    danger:  "bg-[#FEF2F2] text-[#DC2626]",
    success: "bg-[#F0FDF4] text-[#16A34A]",
    warning: "bg-[#FEFCE8] text-[#CA8A04]",
  };

  const inner = (
    <div className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-3 hover:bg-[#FAFAFA] transition-colors">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#71717A] tracking-wide">{label}</p>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${accentIcon[accent]}`}>
          {icon}
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#09090B] tracking-tight tabular-nums">{value}</p>
        {sub && <p className="text-xs text-[#71717A] mt-0.5">{sub}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

// Section header matching dentist dashboard card headers
interface SectionHeaderProps {
  title: string;
  count?: number;
  viewAllHref?: string;
  badge?: React.ReactNode;
}

function SectionHeader({ title, count, viewAllHref, badge }: SectionHeaderProps) {
  return (
    <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[#09090B]">{title}</h2>
          {badge}
        </div>
        {count !== undefined && (
          <p className="text-xs text-[#71717A] mt-0.5">
            {count} item{count !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors shrink-0"
        >
          View all <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export async function PortalDashboard() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: linkData } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!linkData) redirect("/portal/setup");

  const patientId = (linkData as { patient_id: string }).patient_id;

  // Fetch clinic timezone for correct appointment time display, then load
  // all dashboard data in parallel.
  const { data: patientData } = await db
    .from("patients")
    .select("clinic_id")
    .eq("id", patientId)
    .single();
  const clinicId = (patientData as { clinic_id: string } | null)?.clinic_id;

  let clinicTimezone = "Asia/Kolkata"; // safe IST default for MVP
  if (clinicId) {
    const { data: tzSettings } = await db
      .from("clinic_settings")
      .select("timezone")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    clinicTimezone = (tzSettings as { timezone?: string } | null)?.timezone ?? clinicTimezone;
  }

  const [
    appointmentsResult,
    treatmentsResult,
    followUpsResult,
    balanceResult,
    queueResult,
  ] = await Promise.all([
    getAppointments({ status: "scheduled", limit: 3 }),
    getPatientTreatments(patientId),
    getPatientPortalFollowUps(),
    getPortalOutstandingBalance(),
    getQueueStatus(patientId),
  ]);

  const appointments = appointmentsResult.data?.appointments ?? [];
  const treatments = (treatmentsResult.data ?? []).slice(0, 4);
  const allFollowUps = followUpsResult.data ?? [];
  const balance = balanceResult.data ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingFollowUps = allFollowUps.filter((f) => f.status === "pending");
  const overdueFollowUps = pendingFollowUps.filter(
    (f) => new Date(f.due_date) < today
  );
  const upcomingFollowUps = pendingFollowUps.filter(
    (f) => new Date(f.due_date) >= today
  );

  const queueData = queueResult.data;
  const isInQueue =
    queueData?.position !== null && queueData?.myStatus === "waiting";
  const isBeingSeen = queueData?.myStatus === "in_progress";

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold text-[#09090B] tracking-tight">
            My Dashboard
          </h1>
          <p className="text-sm text-[#71717A]">
            Your appointments, treatments and account at a glance
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0 mt-0.5">
          <Link href="/portal/appointments/new">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Book Appointment
          </Link>
        </Button>
      </div>

      {/* ── Stat strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Upcoming"
          value={appointments.length.toString()}
          sub="Appointments"
          icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />}
          href="/portal/appointments"
        />
        <StatCard
          label="Balance"
          value={balance > 0 ? formatCurrency(balance) : "All clear"}
          sub={balance > 0 ? "Remaining" : "No balance due"}
          icon={<CreditCard className="h-3.5 w-3.5" aria-hidden />}
          href="/portal/payments"
          accent={balance > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Follow-Ups"
          value={pendingFollowUps.length.toString()}
          sub={
            overdueFollowUps.length > 0
              ? `${overdueFollowUps.length} overdue`
              : "Pending"
          }
          icon={<Bell className="h-3.5 w-3.5" aria-hidden />}
          href="/portal/follow-ups"
          accent={overdueFollowUps.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Treatments"
          value={treatmentsResult.data?.length.toString() ?? "0"}
          sub="Total recorded"
          icon={<Stethoscope className="h-3.5 w-3.5" aria-hidden />}
          href="/portal/treatments"
        />
      </div>

      {/* ── Queue status (only when active) ─────────────────── */}
      {(isInQueue || isBeingSeen) && queueData && (
        <Link href="/portal/queue" className="block">
          {isBeingSeen ? (
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#16A34A]">
                  It&apos;s Your Turn!
                </p>
                <p className="text-xs text-[#71717A] mt-0.5">
                  Please proceed to the chair — you&apos;re #{queueData.position}.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#16A34A] shrink-0" aria-hidden />
            </div>
          ) : (
            <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E4E4E7] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#16A34A] animate-pulse" />
                  <p className="text-sm font-semibold text-[#09090B]">
                    You&apos;re in the queue
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs text-[#71717A]">
                  Live <ArrowRight className="h-3 w-3" aria-hidden />
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-[#F4F4F5] text-center">
                <div className="px-5 py-4">
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">
                    #{queueData.position}
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5">your number</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">
                    {queueData.patientsAhead}
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5">ahead</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">
                    ~{queueData.estimatedWaitMinutes}m
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5">est. wait</p>
                </div>
              </div>
            </div>
          )}
        </Link>
      )}

      {/* ── Main two-column grid (lg+) ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Left column: appointments + follow-ups */}
        <div className="lg:col-span-3 space-y-4">

          {/* Upcoming appointments */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <SectionHeader
              title="Upcoming Appointments"
              count={appointments.length}
              viewAllHref="/portal/appointments"
            />
            {appointments.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="h-5 w-5" aria-hidden />}
                title="No upcoming appointments"
                description="Book one to get started."
                action={
                  <Button asChild size="sm" variant="secondary">
                    <Link href="/portal/appointments/new">Book now</Link>
                  </Button>
                }
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-[#F4F4F5]">
                {appointments.map((appt) => (
                  <Link key={appt.id} href={`/portal/appointments/${appt.id}`}>
                    <AppointmentCard appointment={appt} portalView timezone={clinicTimezone} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Pending follow-ups */}
          {pendingFollowUps.length > 0 && (
            <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
              <SectionHeader
                title="Follow-Ups"
                count={pendingFollowUps.length}
                viewAllHref="/portal/follow-ups"
                badge={
                  overdueFollowUps.length > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                      {overdueFollowUps.length} overdue
                    </span>
                  ) : undefined
                }
              />
              <div className="divide-y divide-[#F4F4F5]">
                {[...overdueFollowUps, ...upcomingFollowUps]
                  .slice(0, 4)
                  .map((f) => {
                    const dueDate = new Date(f.due_date);
                    dueDate.setHours(0, 0, 0, 0);
                    const isOverdue = dueDate < today;
                    const diffDays = Math.abs(
                      Math.ceil(
                        (dueDate.getTime() - today.getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    );

                    return (
                      <div
                        key={f.id}
                        className="px-5 py-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-7 w-7 rounded-lg bg-[#F4F4F5] flex items-center justify-center shrink-0">
                            <Bell className="h-3.5 w-3.5 text-[#71717A]" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#09090B] truncate">
                              {f.notes ?? "Follow-up"}
                            </p>
                            <p className="text-xs text-[#71717A]">
                              Due {formatDate(f.due_date)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            isOverdue
                              ? "text-[#DC2626]"
                              : "text-[#CA8A04]"
                          }`}
                        >
                          {isOverdue
                            ? `${diffDays}d overdue`
                            : diffDays === 0
                            ? "Today"
                            : `${diffDays}d`}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Right column: treatments + balance */}
        <div className="lg:col-span-2 space-y-4">

          {/* Balance card */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <SectionHeader title="Account Balance" />
            <div className="px-5 pb-5 pt-4">
              {balanceResult.error ? (
                <p className="text-sm text-[#71717A]">Unable to load balance.</p>
              ) : balance <= 0 ? (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-[#F0FDF4] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4.5 w-4.5 text-[#16A34A]" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#16A34A]">
                      No remaining balance
                    </p>
                    <p className="text-xs text-[#71717A] mt-0.5">
                      Your account is all clear.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-[#FEF2F2] flex items-center justify-center shrink-0">
                      <AlertCircle className="h-4.5 w-4.5 text-[#DC2626]" aria-hidden />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[#71717A]">
                        Remaining Balance
                      </p>
                      <p className="text-2xl font-semibold text-[#09090B] tracking-tight tabular-nums mt-0.5">
                        {formatCurrency(balance)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-[#71717A] mt-3">
                    Please contact the clinic to arrange payment.
                  </p>
                  <Link
                    href="/portal/payments"
                    className="mt-3 flex items-center gap-1 text-xs font-medium text-[#09090B] hover:underline underline-offset-4"
                  >
                    View payment history{" "}
                    <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Recent treatments */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <SectionHeader
              title="Recent Treatments"
              count={treatments.length}
              viewAllHref="/portal/treatments"
            />
            {treatments.length === 0 ? (
              <EmptyState
                icon={<Stethoscope className="h-5 w-5" aria-hidden />}
                title="No treatments yet"
                description="Your treatment history will appear here."
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-[#F4F4F5]">
                {treatments.map((t) => (
                  <div
                    key={t.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-[#F4F4F5] flex items-center justify-center shrink-0">
                        <Stethoscope
                          className="h-3.5 w-3.5 text-[#71717A]"
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#09090B] truncate">
                          {t.treatment_type}
                        </p>
                        {t.patient_visible_notes && (
                          <p className="text-xs text-[#71717A] truncate">
                            {t.patient_visible_notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#71717A]">
                        {TREATMENT_STATUS_LABELS[t.status as TreatmentStatus]}
                      </p>
                      <p className="text-xs text-[#A1A1AA] tabular-nums">
                        {formatCurrency(Number(t.cost))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E4E4E7]">
              <h2 className="text-sm font-semibold text-[#09090B]">Quick Actions</h2>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                {
                  href: "/portal/appointments/new",
                  label: "Book Appointment",
                  icon: <CalendarDays className="h-4 w-4" aria-hidden />,
                },
                {
                  href: "/portal/queue",
                  label: "My Queue",
                  icon: <Users className="h-4 w-4" aria-hidden />,
                },
                {
                  href: "/portal/payments",
                  label: balance > 0 ? `Pay ${formatCurrency(balance)}` : "Payments",
                  icon: <CreditCard className="h-4 w-4" aria-hidden />,
                },
                {
                  href: "/portal/follow-ups",
                  label:
                    overdueFollowUps.length > 0
                      ? `Follow-Ups (${overdueFollowUps.length})`
                      : "Follow-Ups",
                  icon: <Bell className="h-4 w-4" aria-hidden />,
                },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-[#09090B] hover:bg-[#F4F4F5] transition-colors"
                >
                  <span className="text-[#71717A]">{link.icon}</span>
                  <span className="truncate">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

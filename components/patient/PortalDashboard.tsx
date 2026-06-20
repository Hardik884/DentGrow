import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getAppointments } from "@/actions/appointments";
import { getPatientTreatments } from "@/actions/treatments";
import { getPatientPortalFollowUps } from "@/actions/follow-ups";
import { getPortalOutstandingBalance } from "@/actions/payments";
import { getQueueStatus } from "@/actions/queue";
import { AppointmentCard } from "@/components/shared/AppointmentCard";
import { OutstandingBalanceCard } from "./OutstandingBalanceCard";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatCurrency, TREATMENT_STATUS_LABELS } from "@/lib/utils";
import { CalendarDays, ArrowRight, Bell, Stethoscope, CreditCard } from "lucide-react";
import type { TreatmentStatus } from "@/types";

export async function PortalDashboard() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: linkData } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!linkData) redirect("/portal/setup");

  const patientId = (linkData as { patient_id: string }).patient_id;

  const [appointmentsResult, treatmentsResult, followUpsResult, balanceResult, queueResult] =
    await Promise.all([
      getAppointments({ status: "scheduled", limit: 3 }),
      getPatientTreatments(patientId),
      getPatientPortalFollowUps(),
      getPortalOutstandingBalance(),
      getQueueStatus(patientId),
    ]);

  const appointments = appointmentsResult.data?.appointments ?? [];
  const treatments = (treatmentsResult.data ?? []).slice(0, 3);
  const allFollowUps = followUpsResult.data ?? [];
  const balance = balanceResult.data ?? 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pendingFollowUps = allFollowUps.filter((f) => f.status === "pending");
  const overdueFollowUps = pendingFollowUps.filter((f) => new Date(f.due_date) < today);
  const upcomingFollowUps = pendingFollowUps.filter((f) => new Date(f.due_date) >= today);

  const queueData = queueResult.data;
  const isInQueue = queueData?.position !== null && queueData?.myStatus === "waiting";
  const isBeingSeen = queueData?.myStatus === "in_progress";

  return (
    <div className="space-y-5">
      {/* Outstanding balance */}
      <OutstandingBalanceCard />

      {/* Queue status — only when in queue */}
      {(isInQueue || isBeingSeen) && queueData && (
        <Link href="/portal/queue">
          {isBeingSeen ? (
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl p-6 text-center space-y-2">
              <div className="h-10 w-10 rounded-full bg-[#16A34A] flex items-center justify-center mx-auto">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#16A34A]">It&apos;s Your Turn!</p>
              <p className="text-3xl font-semibold text-[#09090B]">#{queueData.position}</p>
              <p className="text-xs text-[#71717A]">Please proceed to the chair.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#E4E4E7] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#16A34A] animate-pulse" />
                  <p className="text-sm font-semibold text-[#09090B]">You&apos;re in the queue</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-[#71717A]">
                  Live <ArrowRight className="h-3 w-3" aria-hidden />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">#{queueData.position}</p>
                  <p className="text-xs text-[#71717A] mt-0.5">your number</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">{queueData.patientsAhead}</p>
                  <p className="text-xs text-[#71717A] mt-0.5">ahead</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[#09090B] tabular-nums">~{queueData.estimatedWaitMinutes}m</p>
                  <p className="text-xs text-[#71717A] mt-0.5">est. wait</p>
                </div>
              </div>
            </div>
          )}
        </Link>
      )}

      {/* Upcoming appointments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#09090B]">Upcoming Appointments</h2>
          <Link href="/portal/appointments" className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors">
            View all <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>

        {appointments.length === 0 ? (
          <div className="bg-white border border-[#E4E4E7] rounded-xl">
            <EmptyState
              icon={<CalendarDays className="h-4.5 w-4.5" aria-hidden />}
              title="No upcoming appointments"
              description="Book an appointment to get started."
              action={
                <Link href="/portal/appointments/new" className="text-xs font-medium text-[#09090B] underline underline-offset-4">
                  Book now
                </Link>
              }
            />
          </div>
        ) : (
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
            {appointments.map((appt) => (
              <Link key={appt.id} href={`/portal/appointments/${appt.id}`}>
                <AppointmentCard appointment={appt} portalView />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Pending follow-ups */}
      {pendingFollowUps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#09090B]">Follow-Ups</h2>
              {overdueFollowUps.length > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                  {overdueFollowUps.length} overdue
                </span>
              )}
            </div>
            <Link href="/portal/follow-ups" className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors">
              View all <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
            {[...overdueFollowUps, ...upcomingFollowUps].slice(0, 3).map((f) => {
              const dueDate = new Date(f.due_date);
              dueDate.setHours(0, 0, 0, 0);
              const isOverdue = dueDate < today;
              const diffDays = Math.abs(Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

              return (
                <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Bell className="h-3.5 w-3.5 text-[#A1A1AA] shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#09090B] truncate">{f.notes ?? "Follow-up"}</p>
                      <p className="text-xs text-[#71717A]">Due {formatDate(f.due_date)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${isOverdue ? "text-[#DC2626]" : "text-[#CA8A04]"}`}>
                    {isOverdue ? `${diffDays}d overdue` : diffDays === 0 ? "Today" : `${diffDays}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent treatments */}
      {treatments.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#09090B]">Recent Treatments</h2>
            <Link href="/portal/treatments" className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B] transition-colors">
              View all <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>

          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden divide-y divide-[#F4F4F5]">
            {treatments.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Stethoscope className="h-3.5 w-3.5 text-[#A1A1AA] shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#09090B] truncate">{t.treatment_type}</p>
                    {t.patient_visible_notes && (
                      <p className="text-xs text-[#71717A] truncate">{t.patient_visible_notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-[#71717A]">{TREATMENT_STATUS_LABELS[t.status as TreatmentStatus]}</p>
                  <p className="text-xs text-[#A1A1AA]">{formatCurrency(Number(t.cost))}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { href: "/portal/treatments", label: "Treatment History", icon: <Stethoscope className="h-4 w-4" aria-hidden /> },
          { href: "/portal/payments", label: balance > 0 ? `Payments (${formatCurrency(balance)})` : "Payments", icon: <CreditCard className="h-4 w-4" aria-hidden /> },
          { href: "/portal/follow-ups", label: overdueFollowUps.length > 0 ? `Follow-Ups (${overdueFollowUps.length})` : "Follow-Ups", icon: <Bell className="h-4 w-4" aria-hidden /> },
          { href: "/portal/appointments/new", label: "Book Appointment", icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white border border-[#E4E4E7] rounded-xl p-4 flex items-center gap-2.5 hover:bg-[#FAFAFA] transition-colors"
          >
            <span className="text-[#71717A]">{link.icon}</span>
            <span className="text-sm font-medium text-[#09090B] truncate">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

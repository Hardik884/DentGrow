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
import { formatDate, formatCurrency, TREATMENT_STATUS_LABELS } from "@/lib/utils";
import type { TreatmentStatus } from "@/types";

/**
 * PortalDashboard
 *
 * Patient portal dashboard — aggregates all self-service data into one view.
 *
 * Shows:
 * - Outstanding balance (prominently if > 0)
 * - Current queue status (if checked in today)
 * - Upcoming appointments (next 3)
 * - Pending follow-ups (overdue first)
 * - Recent treatments (last 3)
 * - Quick-nav links
 */
export async function PortalDashboard() {
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Resolve portal link → patient_id
  const { data: linkData } = await db
    .from("patient_portal_links")
    .select("patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!linkData) redirect("/portal/setup");

  const patientId = (linkData as { patient_id: string }).patient_id;

  // Fetch all data in parallel
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
  const treatments = (treatmentsResult.data ?? []).slice(0, 3);
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
    <div className="space-y-5">
      {/* Outstanding balance — shown prominently if > 0 */}
      <OutstandingBalanceCard />

      {/* Queue status — shown only when patient is checked in */}
      {(isInQueue || isBeingSeen) && queueData && (
        <Link href="/portal/queue">
          {isBeingSeen ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center space-y-1">
              <p className="text-green-600 font-semibold text-sm uppercase tracking-wide">
                It&apos;s Your Turn!
              </p>
              <p className="text-3xl font-bold text-green-700">
                #{queueData.position}
              </p>
              <p className="text-green-600 text-sm">
                Please proceed to the chair.
              </p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-blue-700 font-semibold text-sm">
                  You&apos;re in the queue
                </p>
                <span className="text-xs text-blue-500">Live →</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    #{queueData.position}
                  </p>
                  <p className="text-xs text-blue-500">your number</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    {queueData.patientsAhead}
                  </p>
                  <p className="text-xs text-blue-500">ahead of you</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-700">
                    ~{queueData.estimatedWaitMinutes}m
                  </p>
                  <p className="text-xs text-blue-500">est. wait</p>
                </div>
              </div>
              {queueData.currentQueueNumber !== null && (
                <p className="text-xs text-blue-400 text-center">
                  Currently seeing #{queueData.currentQueueNumber}
                </p>
              )}
            </div>
          )}
        </Link>
      )}

      {/* Upcoming appointments */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Upcoming Appointments</h2>
          <Link
            href="/portal/appointments"
            className="text-sm text-blue-600 font-medium"
          >
            View all →
          </Link>
        </div>

        {appointments.length === 0 ? (
          <div className="border rounded-lg p-4 text-sm text-gray-500 text-center">
            No upcoming appointments.{" "}
            <Link href="/portal/appointments/new" className="text-blue-600">
              Book one now
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map((appt) => (
              <Link
                key={appt.id}
                href={`/portal/appointments/${appt.id}`}
              >
                <AppointmentCard appointment={appt} portalView />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Pending follow-ups — overdue first */}
      {pendingFollowUps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              Follow-Ups
              {overdueFollowUps.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                  {overdueFollowUps.length} overdue
                </span>
              )}
            </h2>
            <Link
              href="/portal/follow-ups"
              className="text-sm text-blue-600 font-medium"
            >
              View all →
            </Link>
          </div>

          <div className="bg-white border rounded-lg divide-y">
            {[...overdueFollowUps, ...upcomingFollowUps]
              .slice(0, 3)
              .map((f) => {
                const dueDate = new Date(f.due_date);
                dueDate.setHours(0, 0, 0, 0);
                const isOverdue = dueDate < today;
                const diffDays = Math.abs(
                  Math.ceil(
                    (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                  )
                );

                return (
                  <div key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {f.notes ?? "Follow-up"}
                      </p>
                      <p className="text-xs text-gray-500">
                        Due {formatDate(f.due_date)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        isOverdue ? "text-red-600" : "text-amber-600"
                      }`}
                    >
                      {isOverdue
                        ? `${diffDays}d overdue`
                        : diffDays === 0
                          ? "Due today"
                          : `${diffDays}d left`}
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
            <h2 className="font-semibold text-gray-900">Recent Treatments</h2>
            <Link
              href="/portal/treatments"
              className="text-sm text-blue-600 font-medium"
            >
              View all →
            </Link>
          </div>

          <div className="bg-white border rounded-lg divide-y">
            {treatments.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {t.treatment_type}
                  </p>
                  {t.patient_visible_notes && (
                    <p className="text-xs text-gray-500 truncate">
                      {t.patient_visible_notes}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <p className="text-xs font-medium text-gray-500">
                    {TREATMENT_STATUS_LABELS[t.status as TreatmentStatus]}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatCurrency(Number(t.cost))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/portal/treatments"
          className="border rounded-lg p-4 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Treatment History
        </Link>
        <Link
          href="/portal/payments"
          className="border rounded-lg p-4 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Payments{balance > 0 ? ` (${formatCurrency(balance)} due)` : ""}
        </Link>
        <Link
          href="/portal/follow-ups"
          className="border rounded-lg p-4 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Follow-Ups{" "}
          {overdueFollowUps.length > 0 ? `(${overdueFollowUps.length} overdue)` : ""}
        </Link>
        <Link
          href="/portal/profile"
          className="border rounded-lg p-4 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          My Profile
        </Link>
      </div>
    </div>
  );
}

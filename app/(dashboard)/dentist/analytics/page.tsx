import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import {
  getAnalyticsSummary,
  getAppointmentAnalytics,
  getPatientAnalytics,
  getTreatmentAnalytics,
  getRevenueAnalytics,
  getSourceAnalytics,
  getFollowUpAnalytics,
  getSourcePatientRevenueBreakdown,
  generateBasicInsights,
} from "@/lib/analytics/queries";
import { ChartCard } from "@/components/analytics/ChartCard";
import { MetricCard } from "@/components/analytics/MetricCard";
import { AppointmentsByStatusChart } from "@/components/analytics/AppointmentsByStatusChart";
import { RevenueLineChart } from "@/components/analytics/RevenueLineChart";
import { PatientGrowthChart } from "@/components/analytics/PatientGrowthChart";
import { AcquisitionSourceChart } from "@/components/analytics/AcquisitionSourceChart";
import { TreatmentBreakdownChart } from "@/components/analytics/TreatmentBreakdownChart";
import { FollowUpAnalyticsChart } from "@/components/analytics/FollowUpAnalyticsChart";
import { PeakHoursHeatmap } from "@/components/analytics/PeakHoursHeatmap";
import { PaymentMethodDonut } from "@/components/analytics/PaymentMethodDonut";
import { GenderBreakdownChart } from "@/components/analytics/GenderBreakdownChart";
import { AnalyticsInsightsPanel } from "@/components/analytics/InsightsPanel";
import { SourceBreakdownTable } from "@/components/analytics/SourceBreakdownTable";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Analytics — DentGrow",
};

/**
 * /dentist/analytics
 *
 * Single unified Analytics Dashboard.
 * All metrics, charts, and insights live on this page.
 * Date range from URL search params (?from=&to=), default last 30 days.
 * Dentist-only — enforced by RLS + layout guard.
 */
export default async function AnalyticsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createServerClient();
  // Cast to bypass ssr wrapper type narrowing (matches pattern in actions/*.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = supabase;

  // Resolve authenticated dentist
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await db
    .from("profiles")
    .select("clinic_id, role")
    .eq("id", user.id)
    .single();

  if (!profileData || profileData.role !== "dentist") redirect("/login");

  const clinicId = profileData.clinic_id as string;

  // Resolve date range
  const params = await searchParams;
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  const dateFrom = params.from ?? thirtyDaysAgo;
  const dateTo = params.to ?? today;
  const filter = { clinicId, dateFrom, dateTo };

  // Fetch all data in parallel
  const [
    summary,
    appointmentAnalytics,
    patientAnalytics,
    treatmentAnalytics,
    revenueAnalytics,
    sourceAnalytics,
    followUpAnalytics,
    sourceBreakdown,
    insights,
  ] = await Promise.all([
    getAnalyticsSummary(db, filter),
    getAppointmentAnalytics(db, filter),
    getPatientAnalytics(db, filter),
    getTreatmentAnalytics(db, filter),
    getRevenueAnalytics(db, filter),
    getSourceAnalytics(db, filter),
    getFollowUpAnalytics(db, filter),
    getSourcePatientRevenueBreakdown(db, filter),
    generateBasicInsights(db, filter),
  ]);

  return (
    <div className="space-y-8">

      {/* ── APPOINTMENTS ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Appointments</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard label="Total" value={summary.totalAppointments} />
          <MetricCard label="Today" value={summary.appointmentsToday} accent="blue" />
          <MetricCard label="Completed" value={summary.completedAppointments} accent="green" />
          <MetricCard label="Cancelled" value={summary.cancelledAppointments} accent="red" />
          <MetricCard label="No-Shows" value={summary.noShowAppointments} accent="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <ChartCard title="Appointments by Status">
            <AppointmentsByStatusChart data={appointmentAnalytics.byStatus} />
          </ChartCard>
          <ChartCard title="Peak Hours">
            <PeakHoursHeatmap data={appointmentAnalytics.peakHours} />
          </ChartCard>
        </div>
      </section>

      {/* ── PATIENTS ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Patients</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Patients" value={summary.totalPatients} />
          <MetricCard label="New This Month" value={summary.newPatientsThisMonth} accent="blue" />
          <MetricCard label="Returning" value={summary.returningPatients} accent="green" />
          <MetricCard label="Active" value={summary.activePatients} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <ChartCard title="New Patients Over Time">
            <PatientGrowthChart data={patientAnalytics.newPatientsOverTime} />
          </ChartCard>
          <ChartCard title="Gender Distribution">
            <GenderBreakdownChart data={patientAnalytics.genderBreakdown} />
          </ChartCard>
        </div>
      </section>

      {/* ── REVENUE ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Revenue</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Total Revenue"
            value={formatCurrency(summary.totalRevenue)}
            accent="green"
          />
          <MetricCard
            label="This Month"
            value={formatCurrency(summary.revenueThisMonth)}
            accent="blue"
          />
          <MetricCard
            label="Outstanding"
            value={formatCurrency(summary.outstandingBalances)}
            accent={summary.outstandingBalances > 0 ? "red" : "default"}
          />
          <MetricCard
            label="Avg / Patient"
            value={formatCurrency(summary.avgRevenuePerPatient)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <ChartCard title="Revenue Over Time" className="lg:col-span-2">
            <RevenueLineChart data={revenueAnalytics.overTime} />
          </ChartCard>
          <ChartCard title="By Payment Method">
            <PaymentMethodDonut data={revenueAnalytics.byPaymentMethod} />
          </ChartCard>
          <ChartCard title="Avg Appointments / Day">
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <p className="text-5xl font-bold text-blue-600">
                  {appointmentAnalytics.averagePerDay}
                </p>
                <p className="text-sm text-gray-500 mt-2">appointments per day</p>
                <p className="text-xs text-gray-400 mt-1">
                  MoM growth:{" "}
                  <span
                    className={
                      revenueAnalytics.momGrowth >= 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {revenueAnalytics.momGrowth >= 0 ? "+" : ""}
                    {revenueAnalytics.momGrowth}%
                  </span>
                </p>
              </div>
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ── SOURCE ANALYTICS ────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Acquisition Sources</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Appointment Sources">
            <AcquisitionSourceChart data={sourceAnalytics.breakdown} />
          </ChartCard>
          <ChartCard title="Patients &amp; Revenue by Source">
            <SourceBreakdownTable data={sourceBreakdown} />
          </ChartCard>
        </div>
      </section>

      {/* ── TREATMENTS ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Treatments</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Most Common Treatments">
            <TreatmentBreakdownChart data={treatmentAnalytics.byType} />
          </ChartCard>
          <ChartCard title="Treatment Completion Rate">
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <p className="text-5xl font-bold text-green-600">
                  {treatmentAnalytics.completionRate}%
                </p>
                <p className="text-sm text-gray-500 mt-2">of treatments completed</p>
              </div>
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ── FOLLOW-UPS ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Follow-Ups</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <MetricCard label="Pending" value={summary.pendingFollowUps} accent="amber" />
          <MetricCard label="Completed" value={summary.completedFollowUps} accent="green" />
          <MetricCard
            label="Overdue"
            value={summary.overdueFollowUps}
            accent={summary.overdueFollowUps > 0 ? "red" : "default"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Completed Follow-Ups Over Time" className="lg:col-span-2">
            <FollowUpAnalyticsChart data={followUpAnalytics.completedOverTime} />
          </ChartCard>
        </div>
      </section>

      {/* ── QUEUE ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Queue</h2>
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Avg Wait Time"
            value={summary.avgWaitTimeMinutes > 0 ? `${summary.avgWaitTimeMinutes} min` : "—"}
          />
          <MetricCard label="Served Today" value={summary.patientsServedToday} accent="green" />
          <MetricCard label="Currently Waiting" value={summary.currentWaitingCount} accent="blue" />
        </div>
      </section>

      {/* ── INSIGHTS ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Insights</h2>
        <AnalyticsInsightsPanel insights={insights} />
      </section>

    </div>
  );
}

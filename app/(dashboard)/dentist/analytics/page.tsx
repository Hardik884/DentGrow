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
  title: "Analytics",
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

  // Resolve clinic timezone for accurate "today" boundaries in analytics
  const { data: settingsData } = await db
    .from("clinic_settings")
    .select("timezone")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  const clinicTimezone = (settingsData as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata";

  // Resolve date range
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinicTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  // Anchor the default 30-day start on the clinic-local `today`, not UTC `now`,
  // so the default range's start edge doesn't drift by a day for a non-UTC clinic.
  const thirtyDaysAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  const dateFrom = params.from ?? thirtyDaysAgo;
  const dateTo = params.to ?? today;
  const filter = { clinicId, dateFrom, dateTo, timezone: clinicTimezone };

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

      {/* ── INSIGHTS (top of dashboard) ─────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Insights</h2>
        <AnalyticsInsightsPanel insights={insights} />
      </section>

      {/* ── REVENUE (Revenue Summary + Revenue Over Time, below Insights) ── */}
      <section>
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Revenue</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Clinic Revenue"
            value={formatCurrency(summary.netClinicRevenue)}
            accent="green"
          />
          <MetricCard
            label="Consultancy Income"
            value={formatCurrency(summary.consultancyIncome)}
            accent="blue"
          />
          <MetricCard
            label="Total Income"
            value={formatCurrency(summary.totalIncome)}
            accent="green"
          />
          <MetricCard
            label="Remaining"
            value={formatCurrency(summary.outstandingBalances)}
            accent={summary.outstandingBalances > 0 ? "red" : "default"}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <MetricCard
            label="Gross Revenue"
            value={formatCurrency(summary.totalRevenue)}
          />
          <MetricCard
            label="Consultant Payouts"
            value={formatCurrency(summary.consultantPayouts)}
            accent={summary.consultantPayouts > 0 ? "amber" : "default"}
          />
          <MetricCard
            label="This Month (Gross)"
            value={formatCurrency(summary.revenueThisMonth)}
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
                <p className="text-5xl font-bold text-accent">
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

      {/* ── APPOINTMENTS ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-[#09090B] mb-3 uppercase tracking-wider text-[#71717A]">Appointments</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total" value={summary.totalAppointments} />
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
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Patients</h2>
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

      {/* ── SOURCE ANALYTICS ────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Acquisition Sources</h2>
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
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Treatments</h2>
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
        <h2 className="text-xs font-semibold text-[#71717A] uppercase tracking-wider mb-3">Follow-Ups</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Pending/Overdue are a current-backlog snapshot, not activity within
              the selected range, so they carry an explicit "all-time" label
              rather than silently mixing scopes. Completion Rate now IS
              range-scoped (audit B7), so it carries no such label. */}
          <MetricCard label="Pending" value={summary.pendingFollowUps} sub="All-time" accent="amber" />
          <MetricCard label="Completed" value={summary.completedFollowUps} accent="green" />
          <MetricCard
            label="Overdue"
            value={summary.overdueFollowUps}
            sub="All-time"
            accent={summary.overdueFollowUps > 0 ? "red" : "default"}
          />
          <MetricCard
            label="Completion Rate"
            value={`${followUpAnalytics.completionRate}%`}
            accent="blue"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Completed Follow-Ups Over Time" className="lg:col-span-2">
            <FollowUpAnalyticsChart data={followUpAnalytics.completedOverTime} />
          </ChartCard>
        </div>
      </section>

    </div>
  );
}


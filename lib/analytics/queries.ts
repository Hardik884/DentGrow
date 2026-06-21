/**
 * Analytics query builders — fully implemented.
 *
 * All functions:
 * - Accept { clinicId, dateFrom, dateTo } filter.
 * - Return typed result objects defined in types/index.ts.
 * - Use the Supabase server client — called from Server Components / Actions.
 * - Are read-only — no mutations.
 * - Accessible to dentist role only (enforced by RLS + layout guard).
 *
 * Note on typing: the @supabase/ssr createServerClient wraps the underlying
 * typed client in a way that causes TypeScript to infer `never` for some table
 * types in strict mode. We follow the same pattern used in actions/*.ts and
 * accept the client as `DbClient = any`. All data arrays are explicitly typed
 * after fetch to retain application-level type safety.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

import type {
  AppointmentAnalytics,
  PatientAnalytics,
  TreatmentAnalytics,
  RevenueAnalytics,
  SourceAnalytics,
  FollowUpAnalytics,
  DashboardKPIs,
  AppointmentSource,
  PaymentMethod,
  AppointmentStatus,
} from "@/types";

export interface DateRangeFilter {
  clinicId: string;
  dateFrom: string;
  dateTo: string;
  /** IANA timezone for the clinic — e.g. "Asia/Kolkata". Defaults to UTC. */
  timezone?: string;
}

function startOf(date: string): string {
  return `${date}T00:00:00.000Z`;
}
function endOf(date: string): string {
  return `${date}T23:59:59.999Z`;
}

/**
 * utcBoundariesForLocalDate
 *
 * Returns the UTC ISO timestamps representing the start and end of the given
 * local-calendar date in the specified IANA timezone. Use this when filtering
 * a `timestamptz` column by a clinic's local "today" so queries don't miss
 * rows on either side of UTC midnight.
 */
function utcBoundariesForLocalDate(
  localDate: string,
  timezone: string
): { start: string; end: string } {
  const startMs = zonedDatetimeToUtcMs(`${localDate}T00:00:00`, timezone);
  const endMs = zonedDatetimeToUtcMs(`${localDate}T23:59:59.999`, timezone);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

/**
 * zonedDatetimeToUtcMs
 *
 * Converts a wall-clock datetime string interpreted in `timezone` to a UTC
 * epoch-ms value. Uses Intl.DateTimeFormat to determine the offset.
 */
function zonedDatetimeToUtcMs(localDatetime: string, timezone: string): number {
  // Step 1: parse the local string as if it were UTC, get a reference point.
  const naiveUtcMs = Date.parse(`${localDatetime}Z`);

  // Step 2: ask Intl what wall-clock time `naiveUtcMs` shows in `timezone`.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(naiveUtcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const tzAsUtcMs = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) === 24 ? 0 : Number(get("hour")),
    Number(get("minute")),
    Number(get("second"))
  );

  // Step 3: the offset is naiveUtc - tzAsUtc. Apply it to get the real UTC.
  const offsetMs = naiveUtcMs - tzAsUtcMs;
  return naiveUtcMs + offsetMs;
}

// =============================================================================
// Row shapes — used to type-cast Supabase results
// =============================================================================

interface ApptRow {
  status: AppointmentStatus;
  source: AppointmentSource;
  scheduled_at: string;
  duration_minutes: number;
}
interface PatientRow {
  id: string;
  name: string;
  created_at: string;
  date_of_birth: string | null;
  gender: string | null;
  total_visits: number;
  last_visit: string | null;
}
interface PaymentRow {
  amount: number;
  method: PaymentMethod;
  payment_date: string;
  patient_id: string;
  appointment_id: string | null;
}
interface TreatmentRow {
  treatment_type: string;
  cost: number;
  status: string;
  performed_at: string | null;
  patient_id: string;
}
interface FollowUpRow {
  status: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}
interface QueueRow {
  status: string;
  checked_in_at: string;
  called_at: string | null;
}

// =============================================================================
// getDashboardKPIs — today-only, used by dentist dashboard
// =============================================================================

export async function getDashboardKPIs(
  supabase: DbClient,
  clinicId: string,
  /** IANA timezone for the clinic — e.g. "Asia/Kolkata". Defaults to UTC. */
  timezone: string = "Asia/Kolkata"
): Promise<DashboardKPIs> {
  // Compute "today" in the clinic's local calendar so a clinic in IST at
  // 01:00 doesn't query against the previous UTC date and miss appointments.
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Convert local day boundaries to UTC ISO strings for timestamptz queries.
  const { start: todayStartIso, end: todayEndIso } = utcBoundariesForLocalDate(
    todayDate,
    timezone
  );

  const [apptRes, queueRes, revenueRes, newPatientsRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("status, source")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gte("scheduled_at", todayStartIso)
      .lte("scheduled_at", todayEndIso),

    supabase
      .from("queue_entries")
      .select("status")
      .eq("clinic_id", clinicId)
      .eq("queue_date", todayDate),

    supabase
      .from("payments")
      .select("amount")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("payment_date", todayDate),

    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gte("created_at", todayStartIso)
      .lte("created_at", todayEndIso),
  ]);

  const appointments = (apptRes.data ?? []) as Pick<ApptRow, "status" | "source">[];
  const queueEntries = (queueRes.data ?? []) as Pick<QueueRow, "status">[];
  const payments = (revenueRes.data ?? []) as Pick<PaymentRow, "amount">[];

  const totalAppointmentsToday = appointments.length;
  const seenPatientsToday = appointments.filter((a) => a.status === "completed").length;
  const noShowsToday = appointments.filter((a) => a.status === "no_show").length;
  const walkInsToday = appointments.filter((a) => a.source === "walk_in").length;
  const waitingPatients = queueEntries.filter((q) => q.status === "waiting").length;
  const revenueToday = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const completionRateToday =
    totalAppointmentsToday > 0
      ? Math.round((seenPatientsToday / totalAppointmentsToday) * 100)
      : 0;

  return {
    totalAppointmentsToday,
    seenPatientsToday,
    completionRateToday,
    waitingPatients,
    noShowsToday,
    revenueToday,
    newPatientsToday: newPatientsRes.count ?? 0,
    walkInsToday,
  };
}

// =============================================================================
// getAnalyticsSummary — all headline KPIs for the analytics dashboard overview
// =============================================================================

export interface AnalyticsSummary {
  totalAppointments: number;
  appointmentsToday: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  totalPatients: number;
  newPatientsThisMonth: number;
  returningPatients: number;
  activePatients: number;
  totalRevenue: number;
  revenueThisMonth: number;
  outstandingBalances: number;
  avgRevenuePerPatient: number;
  pendingFollowUps: number;
  completedFollowUps: number;
  overdueFollowUps: number;
  avgWaitTimeMinutes: number;
  patientsServedToday: number;
  currentWaitingCount: number;
}

export async function getAnalyticsSummary(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<AnalyticsSummary> {
  const { clinicId, dateFrom, dateTo } = filter;
  const timezone = filter.timezone ?? "Asia/Kolkata";

  // Compute "today" in the clinic's local calendar (not server-local or UTC).
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Build UTC boundaries for today using the clinic timezone so the query
  // doesn't miss appointments on either side of UTC midnight.
  const { start: todayStartIso, end: todayEndIso } = utcBoundariesForLocalDate(todayDate, timezone);

  // First day of the current month in the clinic's local calendar
  const [yr, mo] = todayDate.split("-").map(Number);
  const monthStartDate = `${yr}-${String(mo).padStart(2, "0")}-01`;
  const { start: monthStartIso } = utcBoundariesForLocalDate(monthStartDate, timezone);

  const today = todayDate;

  const [
    apptRes, apptTodayRes, patientsRes, newPatientsMonthRes,
    paymentsRes, treatmentsRes, followUpsRes, queueTodayRes,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("status, source, scheduled_at, duration_minutes")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("scheduled_at", startOf(dateFrom)).lte("scheduled_at", endOf(dateTo)),

    supabase
      .from("appointments")
      .select("status, source")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("scheduled_at", todayStartIso).lte("scheduled_at", todayEndIso),

    supabase
      .from("patients")
      .select("id, created_at, total_visits, last_visit")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("created_at", monthStartIso),

    supabase
      .from("payments")
      .select("amount, patient_id, payment_date")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("payment_date", dateFrom).lte("payment_date", dateTo),

    supabase
      .from("treatments")
      .select("cost, patient_id")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("follow_ups")
      .select("status, due_date")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("queue_entries")
      .select("status, checked_in_at, called_at")
      .eq("clinic_id", clinicId)
      .eq("queue_date", todayDate),
  ]);

  const appointments = (apptRes.data ?? []) as ApptRow[];
  const appointmentsToday = (apptTodayRes.data ?? []) as Pick<ApptRow, "status" | "source">[];
  const patients = (patientsRes.data ?? []) as Pick<PatientRow, "id" | "created_at" | "total_visits" | "last_visit">[];
  const payments = (paymentsRes.data ?? []) as Pick<PaymentRow, "amount" | "patient_id" | "payment_date">[];
  const treatments = (treatmentsRes.data ?? []) as Pick<TreatmentRow, "cost" | "patient_id">[];
  const followUps = (followUpsRes.data ?? []) as Pick<FollowUpRow, "status" | "due_date">[];
  const queueToday = (queueTodayRes.data ?? []) as QueueRow[];

  const totalAppointments = appointments.length;
  const completedAppointments = appointments.filter((a) => a.status === "completed").length;
  const cancelledAppointments = appointments.filter((a) => a.status === "cancelled").length;
  const noShowAppointments = appointments.filter((a) => a.status === "no_show").length;
  const appointmentsTodayCount = appointmentsToday.length;

  const totalPatients = patients.length;
  const newPatientsThisMonth = newPatientsMonthRes.count ?? 0;
  const returningPatients = patients.filter((p) => (p.total_visits ?? 0) > 1).length;
  const activePatients = patients.filter((p) => p.last_visit !== null).length;

  const totalRevenue = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const revenueThisMonth = payments
    .filter((p) => p.payment_date >= monthStartDate)
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const totalTreatmentCost = treatments.reduce((sum, t) => sum + Number(t.cost ?? 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const outstandingBalances = Math.max(0, totalTreatmentCost - totalPaid);

  const patientsWithPayments = new Set(payments.map((p) => p.patient_id)).size;
  const avgRevenuePerPatient = patientsWithPayments > 0 ? totalRevenue / patientsWithPayments : 0;

  const pendingFollowUps = followUps.filter((f) => f.status === "pending").length;
  const completedFollowUps = followUps.filter((f) => f.status === "completed").length;
  const overdueFollowUps = followUps.filter(
    (f) => f.status === "pending" && f.due_date < today
  ).length;

  const completedQueueEntries = queueToday.filter((q) => q.status === "completed");
  const patientsServedToday = completedQueueEntries.length;
  const currentWaitingCount = queueToday.filter((q) => q.status === "waiting").length;

  const waitTimes = completedQueueEntries
    .filter((q) => q.called_at && q.checked_in_at)
    .map((q) => (new Date(q.called_at!).getTime() - new Date(q.checked_in_at).getTime()) / 60000);
  const avgWaitTimeMinutes =
    waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;

  void todayDate;

  return {
    totalAppointments, appointmentsToday: appointmentsTodayCount,
    completedAppointments, cancelledAppointments, noShowAppointments,
    totalPatients, newPatientsThisMonth, returningPatients, activePatients,
    totalRevenue, revenueThisMonth, outstandingBalances, avgRevenuePerPatient,
    pendingFollowUps, completedFollowUps, overdueFollowUps,
    avgWaitTimeMinutes, patientsServedToday, currentWaitingCount,
  };
}

// =============================================================================
// getAppointmentAnalytics
// =============================================================================

export async function getAppointmentAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<AppointmentAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;

  const { data } = await supabase
    .from("appointments")
    .select("status, scheduled_at, source")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .gte("scheduled_at", startOf(dateFrom))
    .lte("scheduled_at", endOf(dateTo));

  const rows = (data ?? []) as ApptRow[];

  // Group by date + status
  const byStatusMap: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const date = row.scheduled_at.split("T")[0];
    if (!byStatusMap[date]) byStatusMap[date] = {};
    byStatusMap[date][row.status] = (byStatusMap[date][row.status] ?? 0) + 1;
  }
  const byStatus: AppointmentAnalytics["byStatus"] = [];
  for (const [date, statuses] of Object.entries(byStatusMap)) {
    for (const [status, count] of Object.entries(statuses)) {
      byStatus.push({ date, status: status as AppointmentStatus, count });
    }
  }
  byStatus.sort((a, b) => a.date.localeCompare(b.date));

  const dailyTotals: Record<string, { total: number; cancelled: number; noShow: number }> = {};
  for (const row of rows) {
    const date = row.scheduled_at.split("T")[0];
    if (!dailyTotals[date]) dailyTotals[date] = { total: 0, cancelled: 0, noShow: 0 };
    dailyTotals[date].total += 1;
    if (row.status === "cancelled") dailyTotals[date].cancelled += 1;
    if (row.status === "no_show") dailyTotals[date].noShow += 1;
  }

  const cancellationRate: AppointmentAnalytics["cancellationRate"] = [];
  const noShowRate: AppointmentAnalytics["noShowRate"] = [];
  for (const [date, counts] of Object.entries(dailyTotals)) {
    cancellationRate.push({
      date,
      rate: counts.total > 0 ? Math.round((counts.cancelled / counts.total) * 100) : 0,
    });
    noShowRate.push({
      date,
      rate: counts.total > 0 ? Math.round((counts.noShow / counts.total) * 100) : 0,
    });
  }

  const uniqueDays = Object.keys(dailyTotals).length;
  const averagePerDay = uniqueDays > 0 ? Math.round(rows.length / uniqueDays) : 0;

  // Build peak hours using the clinic's local timezone so that a 9:00 AM
  // appointment stored as 03:30 UTC (Asia/Kolkata) is bucketed into hour 9,
  // not hour 3. getUTCHours() / getUTCDay() would produce wrong buckets for
  // any timezone that is not UTC.
  const tz = filter.timezone ?? "Asia/Kolkata";
  const peakMap: Record<string, number> = {};
  for (const row of rows) {
    const dt = new Date(row.scheduled_at);
    // Extract local hour and day-of-week using Intl — works for any IANA timezone
    const localParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(dt);
    const hourStr = localParts.find((p) => p.type === "hour")?.value ?? "0";
    const weekdayStr = localParts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const DOW_MAP: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    // Intl hour12:false returns "24" for midnight on some platforms — normalise
    const hour = parseInt(hourStr) % 24;
    const dayOfWeek = DOW_MAP[weekdayStr] ?? 0;
    const key = `${hour}:${dayOfWeek}`;
    peakMap[key] = (peakMap[key] ?? 0) + 1;
  }
  const peakHours: AppointmentAnalytics["peakHours"] = Object.entries(peakMap).map(([key, count]) => {
    const [hour, dayOfWeek] = key.split(":").map(Number);
    return { hour, dayOfWeek, count };
  });

  return { byStatus, cancellationRate, noShowRate, averagePerDay, peakHours };
}

// =============================================================================
// getPatientAnalytics
// =============================================================================

export async function getPatientAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<PatientAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;

  const { data } = await supabase
    .from("patients")
    .select("id, name, created_at, date_of_birth, gender, total_visits")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null);

  const rows = (data ?? []) as PatientRow[];

  const newInRange = rows.filter(
    (p) => p.created_at >= startOf(dateFrom) && p.created_at <= endOf(dateTo)
  );
  const newByDate: Record<string, number> = {};
  for (const p of newInRange) {
    const date = p.created_at.split("T")[0];
    newByDate[date] = (newByDate[date] ?? 0) + 1;
  }
  const newPatientsOverTime = Object.entries(newByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const returningVsNew = {
    returning: rows.filter((p) => (p.total_visits ?? 0) > 1).length,
    new: rows.filter((p) => (p.total_visits ?? 0) <= 1).length,
  };

  const now = new Date();
  const ageGroups: Record<string, number> = {
    "0-17": 0, "18-30": 0, "31-45": 0, "46-60": 0, "61+": 0,
  };
  for (const p of rows) {
    if (!p.date_of_birth) continue;
    const dob = new Date(p.date_of_birth);
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
    if (age < 18) ageGroups["0-17"]++;
    else if (age <= 30) ageGroups["18-30"]++;
    else if (age <= 45) ageGroups["31-45"]++;
    else if (age <= 60) ageGroups["46-60"]++;
    else ageGroups["61+"]++;
  }
  const ageDistribution = Object.entries(ageGroups).map(([ageGroup, count]) => ({ ageGroup, count }));

  const genderMap: Record<string, number> = {};
  for (const p of rows) {
    const g = p.gender ?? "unknown";
    genderMap[g] = (genderMap[g] ?? 0) + 1;
  }
  const genderBreakdown = Object.entries(genderMap).map(([gender, count]) => ({ gender, count }));

  const topPatients = [...rows]
    .sort((a, b) => (b.total_visits ?? 0) - (a.total_visits ?? 0))
    .slice(0, 10)
    .map((p) => ({ patientId: p.id, name: p.name, visits: p.total_visits ?? 0 }));

  return { newPatientsOverTime, returningVsNew, ageDistribution, genderBreakdown, topPatients };
}

// =============================================================================
// getTreatmentAnalytics
// =============================================================================

export async function getTreatmentAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<TreatmentAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;

  const { data } = await supabase
    .from("treatments")
    .select("treatment_type, cost, status, performed_at")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .gte("created_at", startOf(dateFrom))
    .lte("created_at", endOf(dateTo));

  const rows = (data ?? []) as TreatmentRow[];

  const typeMap: Record<string, { count: number; totalCost: number; completedCount: number }> = {};
  let completedCount = 0;
  for (const t of rows) {
    const tt = t.treatment_type ?? "Other";
    if (!typeMap[tt]) typeMap[tt] = { count: 0, totalCost: 0, completedCount: 0 };
    typeMap[tt].count += 1;
    typeMap[tt].totalCost += Number(t.cost ?? 0);
    if (t.status === "completed") {
      typeMap[tt].completedCount += 1;
      completedCount++;
    }
  }

  const byType = Object.entries(typeMap)
    .map(([treatmentType, v]) => ({ treatmentType, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const avgCostByType = Object.entries(typeMap).map(([treatmentType, v]) => ({
    treatmentType,
    avgCost: v.count > 0 ? Math.round((v.totalCost / v.count) * 100) / 100 : 0,
  }));

  const revenueByType = Object.entries(typeMap)
    .map(([treatmentType, v]) => ({ treatmentType, revenue: v.totalCost }))
    .sort((a, b) => b.revenue - a.revenue);

  const completionRate = rows.length > 0 ? Math.round((completedCount / rows.length) * 100) : 0;

  return { byType, avgCostByType, completionRate, revenueByType };
}

// =============================================================================
// getRevenueAnalytics
// =============================================================================

export async function getRevenueAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<RevenueAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;

  const [paymentsRes, treatmentsRes, appointmentsRes] = await Promise.all([
    supabase
      .from("payments")
      .select("amount, method, payment_date, patient_id, appointment_id")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("payment_date", dateFrom).lte("payment_date", dateTo),

    supabase
      .from("treatments")
      .select("cost, patient_id")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("appointments")
      .select("id, source, status")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("scheduled_at", startOf(dateFrom)).lte("scheduled_at", endOf(dateTo)),
  ]);

  const payments = (paymentsRes.data ?? []) as PaymentRow[];
  const treatments = (treatmentsRes.data ?? []) as TreatmentRow[];
  const appts = (appointmentsRes.data ?? []) as Array<{ id: string; source: AppointmentSource; status: AppointmentStatus }>;

  const overTimeMap: Record<string, number> = {};
  for (const p of payments) {
    overTimeMap[p.payment_date] = (overTimeMap[p.payment_date] ?? 0) + (p.amount ?? 0);
  }
  const overTime = Object.entries(overTimeMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const methodMap: Record<string, number> = {};
  for (const p of payments) {
    methodMap[p.method] = (methodMap[p.method] ?? 0) + (p.amount ?? 0);
  }
  const byPaymentMethod = Object.entries(methodMap).map(([method, amount]) => ({
    method: method as PaymentMethod,
    amount,
  }));

  const apptSourceMap: Record<string, string> = {};
  for (const a of appts) {
    apptSourceMap[a.id] = a.source;
  }
  const sourceRevenueMap: Record<string, number> = {};
  for (const p of payments) {
    const src = p.appointment_id ? (apptSourceMap[p.appointment_id] ?? "other") : "other";
    sourceRevenueMap[src] = (sourceRevenueMap[src] ?? 0) + (p.amount ?? 0);
  }
  const bySource = Object.entries(sourceRevenueMap).map(([source, amount]) => ({
    source: source as AppointmentSource,
    amount,
  }));

  const totalTreatmentCost = treatments.reduce((s, t) => s + Number(t.cost ?? 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const outstandingTotal = Math.max(0, totalTreatmentCost - totalPaid);

  const completedAppts = appts.filter((a) => a.status === "completed").length;
  const totalInRange = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
  const avgPerCompletedAppointment = completedAppts > 0 ? totalInRange / completedAppts : 0;

  const now = new Date();
  const tz = filter.timezone ?? "Asia/Kolkata";
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const [tYr, tMo] = todayStr.split("-").map(Number);
  const currentMonthStart = `${tYr}-${String(tMo).padStart(2, "0")}-01`;
  const prevMo = tMo === 1 ? 12 : tMo - 1;
  const prevYr = tMo === 1 ? tYr - 1 : tYr;
  const prevMonthStart = `${prevYr}-${String(prevMo).padStart(2, "0")}-01`;
  const prevMonthEnd = new Date(tYr, tMo - 1, 0).toLocaleDateString("en-CA");

  const [curRes, prevRes] = await Promise.all([
    supabase.from("payments").select("amount").eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("payment_date", currentMonthStart),
    supabase.from("payments").select("amount").eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("payment_date", prevMonthStart).lte("payment_date", prevMonthEnd),
  ]);

  const curTotal = ((curRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);
  const prevTotal = ((prevRes.data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0);
  const momGrowth = prevTotal > 0 ? Math.round(((curTotal - prevTotal) / prevTotal) * 100) : 0;

  return { overTime, byPaymentMethod, bySource, outstandingTotal, avgPerCompletedAppointment, momGrowth };
}

// =============================================================================
// getSourceAnalytics
// =============================================================================

export async function getSourceAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<SourceAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;

  const { data } = await supabase
    .from("appointments")
    .select("source, status, scheduled_at")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .gte("scheduled_at", startOf(dateFrom))
    .lte("scheduled_at", endOf(dateTo));

  const rows = (data ?? []) as ApptRow[];

  const breakdownMap: Record<string, number> = {};
  for (const a of rows) {
    breakdownMap[a.source] = (breakdownMap[a.source] ?? 0) + 1;
  }
  const breakdown = Object.entries(breakdownMap).map(([source, count]) => ({
    source: source as AppointmentSource,
    count,
  }));

  const trendMap: Record<string, Record<string, number>> = {};
  for (const a of rows) {
    const date = a.scheduled_at.split("T")[0];
    if (!trendMap[date]) trendMap[date] = {};
    trendMap[date][a.source] = (trendMap[date][a.source] ?? 0) + 1;
  }
  const trendOverTime: SourceAnalytics["trendOverTime"] = [];
  for (const [date, sources] of Object.entries(trendMap)) {
    for (const [source, count] of Object.entries(sources)) {
      trendOverTime.push({ date, source: source as AppointmentSource, count });
    }
  }
  trendOverTime.sort((a, b) => a.date.localeCompare(b.date));

  const convMap: Record<string, { booked: number; completed: number; noShow: number }> = {};
  for (const a of rows) {
    if (!convMap[a.source]) convMap[a.source] = { booked: 0, completed: 0, noShow: 0 };
    convMap[a.source].booked += 1;
    if (a.status === "completed") convMap[a.source].completed += 1;
    if (a.status === "no_show") convMap[a.source].noShow += 1;
  }
  const conversionBySource = Object.entries(convMap).map(([source, v]) => ({
    source: source as AppointmentSource,
    ...v,
  }));

  return { breakdown, trendOverTime, conversionBySource };
}

// =============================================================================
// getFollowUpAnalytics
// =============================================================================

export async function getFollowUpAnalytics(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<FollowUpAnalytics> {
  const { clinicId, dateFrom, dateTo } = filter;
  const tz = filter.timezone ?? "Asia/Kolkata";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const [followUpsRes, withTreatmentRes] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("status, due_date, created_at, updated_at")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("follow_ups")
      .select("status, treatment_id, treatments(treatment_type)")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .not("treatment_id", "is", null),
  ]);

  const followUps = (followUpsRes.data ?? []) as FollowUpRow[];
  const withTreatments = (withTreatmentRes.data ?? []) as Array<{
    status: string;
    treatment_id: string | null;
    treatments: { treatment_type: string } | { treatment_type: string }[] | null;
  }>;

  const pendingCount = followUps.filter((f) => f.status === "pending").length;
  const overdueCount = followUps.filter(
    (f) => f.status === "pending" && f.due_date < today
  ).length;
  const completionRate =
    followUps.length > 0
      ? Math.round((followUps.filter((f) => f.status === "completed").length / followUps.length) * 100)
      : 0;

  const completedInRange = followUps.filter(
    (f) => f.status === "completed" &&
      f.updated_at >= startOf(dateFrom) && f.updated_at <= endOf(dateTo)
  );
  const completedByDate: Record<string, number> = {};
  for (const f of completedInRange) {
    const date = f.updated_at.split("T")[0];
    completedByDate[date] = (completedByDate[date] ?? 0) + 1;
  }
  const completedOverTime = Object.entries(completedByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const ttMap: Record<string, number> = {};
  for (const f of withTreatments) {
    const treatmentData = f.treatments;
    const tt = Array.isArray(treatmentData)
      ? (treatmentData[0]?.treatment_type ?? "Unknown")
      : (treatmentData?.treatment_type ?? "Unknown");
    ttMap[tt] = (ttMap[tt] ?? 0) + 1;
  }
  const byTreatmentType = Object.entries(ttMap)
    .map(([treatmentType, count]) => ({ treatmentType, count }))
    .sort((a, b) => b.count - a.count);

  return { pendingCount, overdueCount, completedOverTime, completionRate, byTreatmentType };
}

// =============================================================================
// getSourcePatientRevenueBreakdown
// =============================================================================

export interface SourceBreakdownItem {
  source: AppointmentSource;
  label: string;
  patientCount: number;
  revenue: number;
}

export async function getSourcePatientRevenueBreakdown(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<SourceBreakdownItem[]> {
  const { clinicId, dateFrom, dateTo } = filter;

  const [apptRes, paymentsRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, source, patient_id")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("scheduled_at", startOf(dateFrom)).lte("scheduled_at", endOf(dateTo)),

    supabase
      .from("payments")
      .select("amount, appointment_id")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("payment_date", dateFrom).lte("payment_date", dateTo),
  ]);

  const appointments = (apptRes.data ?? []) as Array<{
    id: string; source: AppointmentSource; patient_id: string;
  }>;
  const payments = (paymentsRes.data ?? []) as Array<{
    amount: number; appointment_id: string | null;
  }>;

  const apptSourceMap: Record<string, string> = {};
  const sourcePatients: Record<string, Set<string>> = {};
  for (const a of appointments) {
    apptSourceMap[a.id] = a.source;
    if (!sourcePatients[a.source]) sourcePatients[a.source] = new Set();
    sourcePatients[a.source].add(a.patient_id);
  }

  const sourceRevenue: Record<string, number> = {};
  for (const p of payments) {
    const src = p.appointment_id ? (apptSourceMap[p.appointment_id] ?? "other") : "other";
    sourceRevenue[src] = (sourceRevenue[src] ?? 0) + (p.amount ?? 0);
  }

  const SOURCE_LABELS: Record<string, string> = {
    walk_in: "Walk-in", phone_call: "Phone Call", website: "Website",
    referral: "Referral", other: "Other",
  };

  const allSources: AppointmentSource[] = ["walk_in", "phone_call", "website", "referral", "other"];
  return allSources.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    patientCount: sourcePatients[source]?.size ?? 0,
    revenue: sourceRevenue[source] ?? 0,
  }));
}

// =============================================================================
// generateBasicInsights — rule-based insights (no AI)
// =============================================================================

export interface Insight {
  title: string;
  value: string;
  description: string;
}

export async function generateBasicInsights(
  supabase: DbClient,
  filter: DateRangeFilter
): Promise<Insight[]> {
  const { clinicId, dateFrom, dateTo } = filter;

  const [apptRes, treatmentsRes, followUpsRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("source, status, scheduled_at, duration_minutes")
      .eq("clinic_id", clinicId).is("deleted_at", null)
      .gte("scheduled_at", startOf(dateFrom)).lte("scheduled_at", endOf(dateTo)),

    supabase
      .from("treatments")
      .select("treatment_type, cost, status")
      .eq("clinic_id", clinicId).is("deleted_at", null),

    supabase
      .from("follow_ups")
      .select("status")
      .eq("clinic_id", clinicId).is("deleted_at", null),
  ]);

  const appts = (apptRes.data ?? []) as ApptRow[];
  const treatments = (treatmentsRes.data ?? []) as TreatmentRow[];
  const followUps = (followUpsRes.data ?? []) as Pick<FollowUpRow, "status">[];

  const insights: Insight[] = [];

  // Most common patient source
  const sourceCount: Record<string, number> = {};
  for (const a of appts) sourceCount[a.source] = (sourceCount[a.source] ?? 0) + 1;
  const topSourceEntry = Object.entries(sourceCount).sort((a, b) => b[1] - a[1])[0];
  if (topSourceEntry) {
    const LABELS: Record<string, string> = {
      walk_in: "Walk-in", phone_call: "Phone Call", website: "Website",
      referral: "Referral", other: "Other",
    };
    insights.push({
      title: "Most Common Patient Source",
      value: LABELS[topSourceEntry[0]] ?? topSourceEntry[0],
      description: `${topSourceEntry[1]} appointments came from this source in the selected period.`,
    });
  }

  // Highest revenue treatment
  const treatmentRevenue: Record<string, number> = {};
  for (const t of treatments) {
    if (t.status === "completed") {
      const tt = t.treatment_type ?? "Other";
      treatmentRevenue[tt] = (treatmentRevenue[tt] ?? 0) + Number(t.cost ?? 0);
    }
  }
  const topTreatmentEntry = Object.entries(treatmentRevenue).sort((a, b) => b[1] - a[1])[0];
  if (topTreatmentEntry) {
    insights.push({
      title: "Highest Revenue Treatment",
      value: topTreatmentEntry[0],
      description: `Generated ₹${topTreatmentEntry[1].toLocaleString("en-IN")} in total revenue.`,
    });
  }

  // Average appointment duration
  const completedAppts = appts.filter((a) => a.status === "completed" && a.duration_minutes);
  if (completedAppts.length > 0) {
    const avgDuration = Math.round(
      completedAppts.reduce((s, a) => s + (a.duration_minutes ?? 30), 0) / completedAppts.length
    );
    insights.push({
      title: "Average Appointment Duration",
      value: `${avgDuration} min`,
      description: `Based on ${completedAppts.length} completed appointments.`,
    });
  }

  // Follow-up completion rate
  const total = followUps.length;
  const completed = followUps.filter((f) => f.status === "completed").length;
  if (total > 0) {
    const rate = Math.round((completed / total) * 100);
    insights.push({
      title: "Follow-up Completion Rate",
      value: `${rate}%`,
      description: `${completed} of ${total} follow-ups have been completed.`,
    });
  }

  return insights;
}

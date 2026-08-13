/**
 * lib/business-brain/metrics-repository.ts
 *
 * Supabase-backed implementation of the Business Brain's `MetricsDataRepository`
 * port. This is the ONLY place the Business Brain's data comes from, and the
 * only file in the system that knows both DentGrow's schema and the engine's
 * snapshot shape.
 *
 * Why it lives in `lib/` and not in `business-brain/repositories/`
 * ----------------------------------------------------------------
 * The port (the interface + snapshot types) belongs to the Business Brain and
 * stays there. The adapter belongs to the application, because it is the thing
 * that depends on Supabase, on DentGrow's table names, and on `lib/` helpers.
 *
 * Keeping it here means `business-brain/` imports no database client and no
 * application code at all — so the module stays portable and its determinism
 * guarantee is absolute rather than "pure except the repositories folder". It
 * also lets this file reuse `lib/scheduling/slots.ts` rather than growing a
 * second, disagreeing definition of clinic capacity.
 *
 * Responsibilities that are ONLY enforced here
 * --------------------------------------------
 * 1. Soft deletes. The string `deleted_at` appears nowhere in `business-brain/`
 *    — the snapshot shape gives no hint it exists. CLAUDE.md §13.14 requires
 *    every query on a soft-deletable table to filter it, and a leaked
 *    soft-deleted treatment would corrupt every revenue metric.
 * 2. Clinic scoping. The engines reject mixed-clinic *metrics* downstream, but
 *    nothing stops a bad query from mixing *rows* before they get there.
 * 3. Timezone. `date` is a clinic-local business date, not a UTC day.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AppointmentSnapshot,
  ClinicDataSnapshot,
  FollowUpSnapshot,
  MetricsDataRepository,
  PatientSnapshot,
  PaymentSnapshot,
  QueueEntrySnapshot,
  TreatmentSnapshot,
} from "@/business-brain";
import type { Database } from "@/types/database.types";
import { DEFAULT_TIMEZONE } from "@/lib/clinic/constants";
import { openMinutes, type AvailabilityRule } from "@/lib/scheduling/slots";
import { getUtcBoundariesForLocalDate } from "@/lib/utils";
import { addDays, dateRange } from "@/business-brain";

/**
 * TYPING NOTE
 * -----------
 * Sixteen files in this codebase fall back to `type DbClient = any` because the
 * Supabase client appears untyped: `.from(...).select(...)` infers `never`.
 *
 * The cause is a version skew between packages, NOT the schema types.
 * `@supabase/ssr` 0.6.1 declares `createServerClient` as returning
 * `SupabaseClient<Database, SchemaName, Schema>`, a three-parameter form from an
 * older `@supabase/supabase-js`; the installed 2.110 has since changed that
 * signature, so the schema object lands in a slot expecting a schema NAME and
 * every table resolves to `never`. Regenerating `types/database.types.ts` was
 * necessary but does not fix it — the fix is aligning the two packages, which
 * carries runtime risk and belongs in its own change.
 *
 * Rather than spread `any` further, every query below declares the exact row
 * shape it selects and narrows the result once through {@link rows}. The
 * mapping code is then fully typed against these declarations — only the
 * client boundary is loose, and it is loose in exactly one place per query.
 */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

interface ClinicSettingsRow {
  timezone: string | null;
  average_appointment_duration: number | null;
  chair_count: number | null;
}
interface AppointmentRow {
  id: string;
  patient_id: string;
  status: string;
  scheduled_at: string;
  created_at: string;
  duration_minutes: number;
  source: string;
}
interface UnavailableDateRow {
  date: string;
}
interface ConsultancyBlockDatedRow {
  date: string;
  start_time: string;
  end_time: string;
}
interface PatientRow {
  id: string;
  created_at: string;
}
interface PatientRosterRow {
  id: string;
  created_at: string;
  last_visit: string | null;
}
interface TreatmentRow {
  id: string;
  cost: number | string | null;
  status: string;
  performed_at: string | null;
  patient_id: string;
  created_at: string;
  opd_charged: boolean | null;
  opd_fee: number | string | null;
  xray_taken: boolean | null;
  xray_cost: number | string | null;
}

/**
 * Appointment statuses that still represent a real upcoming visit.
 * A cancelled or no-show appointment is not one the patient will attend.
 *
 * `as const` is load-bearing: it types this as a tuple of literals rather than
 * `string[]`, so the generated `appointment_status` enum checks every entry at
 * compile time. A typo here would otherwise silently match no rows and report
 * every patient as having nothing booked.
 */
const LIVE_APPOINTMENT_STATUSES = ["scheduled", "checked_in", "in_progress", "completed"] as const;
interface PaymentRow {
  id: string;
  amount: number | string | null;
  payment_date: string;
  patient_id: string;
}
interface QueueRow {
  id: string;
  status: string;
  checked_in_at: string;
  called_at: string | null;
}
interface FollowUpRow {
  id: string;
  due_date: string;
  status: string;
}
interface AvailabilityRuleRow {
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

/** Postgres `time` columns arrive as "HH:MM:SS"; the slot engine wants "HH:MM". */
function toHhMm(time: string): string {
  return time.slice(0, 5);
}

/**
 * Day-of-week (0 = Sunday) for a "YYYY-MM-DD" business date.
 * Read from the date string itself — the business date is already clinic-local,
 * so converting it through a timezone again would shift it.
 */
function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

export interface SupabaseMetricsRepositoryOptions {
  /**
   * Capture moment for the snapshot, ISO-8601. Every metric is stamped with
   * this and time-based calculations (current waiting time) measure against it.
   *
   * This is the one legitimate place the clock is read: the engines themselves
   * are clock-free by design, so injecting it here keeps them testable and
   * makes a snapshot reproducible after the fact.
   */
  readonly asOf?: string;
  /**
   * Length of the trailing schedule window, in days (inclusive of `date`).
   * Must match the Metrics Engine's TRAILING_DAYS, or the window metrics will be
   * named `_30d` while measuring something else.
   */
  readonly trailingWindowDays?: number;
  /** Length of the forward schedule window, in days after `date`. */
  readonly forwardWindowDays?: number;
}

/**
 * Defaults mirror `business-brain` METRIC_WINDOWS. They are restated rather than
 * imported because the window length is part of each metric's NAME
 * (`production_30d`, `booked_next_7d`); changing one side alone would leave a
 * metric measuring something its own key denies.
 */
const DEFAULT_TRAILING_DAYS = 30;
const DEFAULT_FORWARD_DAYS = 7;

/**
 * Reads a clinic's day from Supabase and maps it into the narrow, stable shape
 * the Metrics Engine reasons over.
 *
 * Pass a service-role client (or any client already scoped to the clinic). The
 * queries filter by `clinic_id` explicitly and never rely on RLS for tenant
 * isolation, so the same code is correct under either.
 */
export class SupabaseMetricsDataRepository implements MetricsDataRepository {
  private readonly db: SupabaseClient<Database>;
  private readonly options: SupabaseMetricsRepositoryOptions;

  constructor(db: SupabaseClient<Database>, options: SupabaseMetricsRepositoryOptions = {}) {
    this.db = db;
    this.options = options;
  }

  async getClinicSnapshot(clinicId: string, date: string): Promise<ClinicDataSnapshot> {
    const clock = this.options.asOf ?? new Date().toISOString();

    // Clinic settings drive both the day boundaries and the slot size used for
    // capacity, so they must be resolved before anything date-scoped runs.
    const { data: settings } = await this.db
      .from("clinic_settings")
      .select("timezone, average_appointment_duration, chair_count")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const cfg = (settings ?? null) as ClinicSettingsRow | null;
    const timezone = cfg?.timezone ?? DEFAULT_TIMEZONE;
    const typicalAppointmentMinutes = cfg?.average_appointment_duration ?? 30;
    // A clinic that has never set a chair count is a one-chair clinic. Guarded
    // against 0 as well as null: capacity is open time x chairs, so a zero here
    // would report a working clinic as having no capacity at all.
    const chairCount = Math.max(1, cfg?.chair_count ?? 1);
    const { start: dayStart, end: dayEnd } = getUtcBoundariesForLocalDate(date, timezone);

    // POINT IN TIME
    // -------------
    // `asOf` is the moment the snapshot describes, and for a past date that is
    // the END OF THAT DAY — not now. This used to be the wall clock regardless
    // of `date`, which meant every historical day was measured with today's
    // knowledge: "outstanding balance last Tuesday" returned today's balance,
    // and "does this patient have an upcoming visit" asked about today's future.
    //
    // The Diagnosis Engine reads those history days to decide whether a breach
    // is sustained, improving or intermittent. Feeding it the same current
    // figure for all seven days made every cumulative metric a flat line, so a
    // threshold crossed this morning was classified as sustained for a week.
    //
    // Clamped rather than replaced: for today's date the clock is still the
    // right answer, because a snapshot taken at 11:00 must not claim to know
    // the afternoon.
    const asOf = clock < dayEnd ? clock : dayEnd;
    const trailingDays = this.options.trailingWindowDays ?? DEFAULT_TRAILING_DAYS;
    const forwardDays = this.options.forwardWindowDays ?? DEFAULT_FORWARD_DAYS;
    const trailingFrom = addDays(date, -(trailingDays - 1));
    const forwardFrom = addDays(date, 1);
    const forwardTo = addDays(date, forwardDays);

    // One read of the schedule rules covers today, the trailing window and the
    // forward window — see fetchScheduleInputs.
    const scheduleInputs = await this.fetchScheduleInputs(clinicId, trailingFrom, forwardTo);

    const [
      appointmentsToday,
      patientsRegisteredToday,
      treatments,
      payments,
      queueToday,
      followUps,
      patientsWithFutureAppointment,
      roster,
      trailingAppointments,
      forwardAppointments,
    ] = await Promise.all([
      this.fetchAppointments(clinicId, dayStart, dayEnd),
      this.fetchPatientsRegistered(clinicId, dayStart, dayEnd),
      this.fetchTreatments(clinicId, asOf),
      this.fetchPayments(clinicId, date),
      this.fetchQueue(clinicId, date),
      this.fetchFollowUps(clinicId, date),
      this.fetchPatientsWithFutureAppointments(clinicId, asOf),
      this.fetchPatientRoster(clinicId, asOf),
      this.fetchAppointmentsInRange(clinicId, trailingFrom, date, timezone),
      this.fetchAppointmentsInRange(clinicId, forwardFrom, forwardTo, timezone),
    ]);

    // Depends on today's appointments, so it cannot join the parallel batch.
    //
    // A cancelled or no-show appointment is not a visit — the patient was not
    // seen, so they must not count as "seen"/"returning" today. Filtered to
    // LIVE_APPOINTMENT_STATUSES for the same reason `isScheduled` and
    // `bookedMinutes` already exclude them elsewhere in this file; leaving it
    // unfiltered inflated `patients.returning_today` on days with cancellations
    // (audit: patientsSeenToday row-status gap).
    const patientsSeenToday = await this.fetchPatientsSeen(
      clinicId,
      appointmentsToday
        .filter((a) => (LIVE_APPOINTMENT_STATUSES as readonly string[]).includes(a.status))
        .map((a) => a.patientId),
    );

    return {
      clinicId,
      date,
      asOf,
      appointmentsToday,
      patientsRegisteredToday,
      patientsSeenToday,
      // Keep patientId on the snapshot so revenue.outstanding can clamp per
      // patient (a deposit on one patient's planned work must not erase another
      // patient's billable debt).
      treatments: treatments.map((t) => ({
        ...t,
        isScheduled: patientsWithFutureAppointment.has(t.patientId),
      })),
      payments,
      queueToday,
      followUps,
      capacity: {
        openMinutesToday: this.openMinutesOnDate(date, scheduleInputs),
        chairCount,
        typicalAppointmentMinutes,
      },
      trailingWindow: {
        from: trailingFrom,
        to: date,
        appointments: trailingAppointments,
        openChairMinutes:
          this.openMinutesInRange(trailingFrom, date, scheduleInputs) * chairCount,
      },
      forwardWindow: {
        from: forwardFrom,
        to: forwardTo,
        appointments: forwardAppointments,
        openChairMinutes:
          this.openMinutesInRange(forwardFrom, forwardTo, scheduleInputs) * chairCount,
      },
      patientRoster: roster.map((p) => ({
        id: p.id,
        createdAt: p.created_at,
        lastVisit: p.last_visit,
        hasUpcomingAppointment: patientsWithFutureAppointment.has(p.id),
      })),
    };
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  private async fetchAppointments(
    clinicId: string,
    dayStart: string,
    dayEnd: string,
  ): Promise<AppointmentSnapshot[]> {
    const { data, error } = await this.db
      .from("appointments")
      .select("id, patient_id, status, scheduled_at, created_at, duration_minutes, source")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gte("scheduled_at", dayStart)
      .lte("scheduled_at", dayEnd);
    if (error) throw new Error(`appointments: ${error.message}`);

    return rows<AppointmentRow>(data).map((a) => ({
      id: a.id,
      patientId: a.patient_id,
      status: a.status,
      scheduledAt: a.scheduled_at,
      createdAt: a.created_at,
      durationMinutes: a.duration_minutes,
      source: a.source,
    }));
  }

  private async fetchPatientsRegistered(
    clinicId: string,
    dayStart: string,
    dayEnd: string,
  ): Promise<PatientSnapshot[]> {
    const { data, error } = await this.db
      .from("patients")
      .select("id, created_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);
    if (error) throw new Error(`patients (registered): ${error.message}`);

    return rows<PatientRow>(data).map((p) => ({ id: p.id, createdAt: p.created_at }));
  }

  /**
   * Patients with an appointment today, carrying their record creation date so
   * the engine can separate new from returning. Soft-deleted patients are
   * excluded even when an appointment still references them.
   */
  private async fetchPatientsSeen(
    clinicId: string,
    patientIds: string[],
  ): Promise<PatientSnapshot[]> {
    const unique = [...new Set(patientIds)];
    if (unique.length === 0) return [];

    const { data, error } = await this.db
      .from("patients")
      .select("id, created_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .in("id", unique);
    if (error) throw new Error(`patients (seen): ${error.message}`);

    return rows<PatientRow>(data).map((p) => ({ id: p.id, createdAt: p.created_at }));
  }

  /**
   * Clinic-wide treatments — deliberately NOT date-scoped. Outstanding balance
   * is cumulative, so restricting to one day would under-report it.
   *
   * `isScheduled` — a deliberate patient-level approximation
   * -------------------------------------------------------
   * It answers: does this treatment's patient have ANY upcoming visit booked?
   *
   *   true   the patient has at least one future, non-cancelled, non-no-show
   *          appointment
   *   false  the patient has no upcoming visit at all
   *
   * It is NOT a treatment-to-appointment mapping. A patient booked for a
   * cleaning while a planned crown goes unbooked reads as `true`, and the
   * crown will not appear in `treatment.accepted_pending_scheduling`.
   *
   * That imprecision is accepted knowingly. Modelling it exactly needs a
   * treatment-to-appointment link, which would force the dentist to record
   * which future visit each planned item belongs to — workflow complexity that
   * is not worth the accuracy at this stage. The approximation still answers
   * the question the clinic actually asks:
   *
   *   "Do we have planned treatment where the patient has not even
   *    booked another visit?"
   *
   * The consequence to remember when reading the metric: it UNDER-reports.
   * Anything it flags is genuinely unbooked; some genuinely unbooked work will
   * be missed because the patient has some other appointment.
   */
  /**
   * Treatments that existed as of the snapshot moment.
   *
   * Cumulative by design — outstanding balance is a running total, not a daily
   * figure — but cumulative up to `asOf`, not up to now. A treatment raised
   * after the date being measured was not on the clinic's books then, and
   * counting it made every historical balance equal to today's.
   *
   * The bound is the ECONOMIC event, not the row's creation time, because this
   * app supports backdating (migration 20260713000000): a dentist can record on
   * Wednesday work that was performed on Monday. Monday's balance should
   * include that work — the treatment happened, whatever time the keyboard was
   * touched. So:
   *
   *   performed_at set    -> on the books once the work was performed
   *   performed_at null   -> planned or cancelled; on the books once created
   *
   * Status is corrected on the same evidence. A treatment performed after `asOf`
   * cannot have been `completed` then, so it is reported as `planned` — which is
   * what it must have been, derived from a recorded timestamp rather than
   * guessed — and only if it had been created by then.
   *
   * RESIDUAL, and the reason metric persistence is worth building: status
   * changes are not versioned. A treatment cancelled tomorrow reads as
   * cancelled in yesterday's snapshot, because nothing records when it was
   * cancelled. The effect is a slight UNDER-statement of historical pending
   * value, and no query can close it — only storing each day's metrics as they
   * were measured can.
   */
  private async fetchTreatments(
    clinicId: string,
    asOf: string,
  ): Promise<Array<Omit<TreatmentSnapshot, "isScheduled"> & { patientId: string }>> {
    const { data, error } = await this.db
      .from("treatments")
      .select("id, cost, status, performed_at, patient_id, created_at, opd_charged, opd_fee, xray_taken, xray_cost")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .or(`performed_at.lte.${asOf},created_at.lte.${asOf}`);
    if (error) throw new Error(`treatments: ${error.message}`);

    return rows<TreatmentRow>(data)
      .map((t) => {
        const performedAt = t.performed_at;
        // Performed strictly AFTER the snapshot moment — on a historical snapshot
        // this work had not been delivered yet, so it rolls back to pipeline.
        const performedInFuture = performedAt !== null && performedAt > asOf;
        // Existed by `asOf` if it was performed by then OR merely created by then.
        const existedByAsOf =
          (performedAt !== null && performedAt <= asOf) || t.created_at <= asOf;
        // Neither performed nor even created by then — it did not exist at all.
        if (!existedByAsOf) return null;
        return {
          id: t.id,
          cost: Number(t.cost ?? 0),
          // Preserve the treatment's REAL status. A completed/in_progress
          // treatment whose `performed_at` was simply never recorded must stay
          // billable, or BB outstanding under-reports vs the canonical balance
          // and the payment send-list (audit A8). Only a treatment genuinely
          // performed after this snapshot is rolled back to `planned`.
          status: performedInFuture ? "planned" : t.status,
          performedAt: performedInFuture ? null : performedAt,
          patientId: t.patient_id,
          // OPD and X-ray charges are owed whenever the consultation / radiograph
          // happened, independent of the treatment's own status (see lib/billing).
          opdCharged: t.opd_charged ?? false,
          opdFee: Number(t.opd_fee ?? 0),
          xrayTaken: t.xray_taken ?? false,
          xrayCost: Number(t.xray_cost ?? 0),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }

  /**
   * The clinic's active patient roster.
   *
   * `patients.last_visit` is maintained by `completeAppointmentCascade`, so this
   * is a plain read rather than a derivation. Deciding who counts as lapsed is a
   * business rule and stays in the calculator.
   *
   * COST NOTE: this loads every active patient, and grows linearly with clinic
   * history — the same unbounded-read caveat as treatments and payments. Fine at
   * pilot scale; needs bounding before a clinic with years of records.
   */
  /**
   * The clinic's roster as it stood at `asOf`.
   *
   * Membership is bounded exactly: a patient registered after the date was not
   * on the roster then, and counting them made the historical roster grow
   * backwards in time.
   *
   * `last_visit` is deliberately NOT read from the column. That column is a
   * maintained counter holding the CURRENT most recent visit, so on a
   * historical day it reports visits that had not happened yet — which is
   * precisely backwards for a metric whose job is finding patients not seen in
   * a long time. It is derived from completed appointments instead, which carry
   * their own dates and can therefore be asked about any moment.
   */
  private async fetchPatientRoster(clinicId: string, asOf: string): Promise<PatientRosterRow[]> {
    const [rosterResult, visitsResult] = await Promise.all([
      this.db
        .from("patients")
        .select("id, created_at")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null)
        .lte("created_at", asOf),
      this.db
        .from("appointments")
        .select("patient_id, scheduled_at")
        .eq("clinic_id", clinicId)
        .is("deleted_at", null)
        .eq("status", "completed")
        .lte("scheduled_at", asOf),
    ]);
    if (rosterResult.error) throw new Error(`patients (roster): ${rosterResult.error.message}`);
    if (visitsResult.error) throw new Error(`patients (last visit): ${visitsResult.error.message}`);

    const lastVisit = new Map<string, string>();
    for (const v of rows<{ patient_id: string; scheduled_at: string }>(visitsResult.data)) {
      const current = lastVisit.get(v.patient_id);
      if (current === undefined || v.scheduled_at > current) {
        lastVisit.set(v.patient_id, v.scheduled_at);
      }
    }

    return rows<{ id: string; created_at: string }>(rosterResult.data).map((p) => ({
      id: p.id,
      created_at: p.created_at,
      last_visit: lastVisit.get(p.id) ?? null,
    }));
  }

  /**
   * Patients who have at least one upcoming visit booked.
   *
   * This is the basis for `isScheduled`, and it is deliberately an
   * approximation at the PATIENT level rather than the treatment level — see
   * the note on {@link fetchTreatments}.
   *
   * "Upcoming" means strictly after the snapshot's capture moment and in a
   * status the patient would actually attend; a cancelled or no-show
   * appointment is not a booked visit.
   */
  private async fetchPatientsWithFutureAppointments(
    clinicId: string,
    asOf: string,
  ): Promise<Set<string>> {
    const { data, error } = await this.db
      .from("appointments")
      .select("patient_id")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gt("scheduled_at", asOf)
      .in("status", LIVE_APPOINTMENT_STATUSES);
    if (error) throw new Error(`appointments (future): ${error.message}`);

    return new Set(rows<{ patient_id: string }>(data).map((a) => a.patient_id));
  }

  /**
   * Clinic-wide payments — cumulative, for the same reason as treatments, and
   * bounded by the same moment.
   *
   * Exact, unlike treatments: `payment_date` records when the money arrived, so
   * "payments received on or before D" needs no reconstruction. The bound is on
   * the calendar date rather than a timestamp because that is the column's
   * granularity.
   */
  private async fetchPayments(clinicId: string, date: string): Promise<PaymentSnapshot[]> {
    const { data, error } = await this.db
      .from("payments")
      .select("id, amount, payment_date, patient_id")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .lte("payment_date", date);
    if (error) throw new Error(`payments: ${error.message}`);

    return rows<PaymentRow>(data).map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      paymentDate: p.payment_date,
      patientId: p.patient_id,
    }));
  }

  /**
   * Today's queue. `queue_entries` has no `deleted_at` and is already scoped by
   * `queue_date`, which is the clinic-local business date — so it is compared
   * directly rather than through UTC boundaries.
   */
  private async fetchQueue(clinicId: string, date: string): Promise<QueueEntrySnapshot[]> {
    const { data, error } = await this.db
      .from("queue_entries")
      .select("id, status, checked_in_at, called_at")
      .eq("clinic_id", clinicId)
      .eq("queue_date", date);
    if (error) throw new Error(`queue_entries: ${error.message}`);

    return rows<QueueRow>(data).map((q) => ({
      id: q.id,
      status: q.status,
      checkedInAt: q.checked_in_at,
      // `called_at` is when waiting ended; null means the patient is still waiting.
      startedAt: q.called_at,
    }));
  }

  /**
   * Pending follow-ups due on or before the target date — exactly the set the
   * due-today and overdue calculators need, and nothing more.
   */
  private async fetchFollowUps(clinicId: string, date: string): Promise<FollowUpSnapshot[]> {
    const { data, error } = await this.db
      .from("follow_ups")
      .select("id, due_date, status")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("status", "pending")
      .lte("due_date", date);
    if (error) throw new Error(`follow_ups: ${error.message}`);

    return rows<FollowUpRow>(data).map((f) => ({ id: f.id, dueDate: f.due_date, status: f.status }));
  }

  /**
   * Schedule inputs for a date RANGE, fetched once.
   *
   * Capacity is per-day, but querying per day would issue three round-trips for
   * every date in a 30-day window. Instead the rules, holidays and consultancy
   * blocks are read once for the widest range needed, and each day's slot count
   * is computed from them in memory. Query count is therefore constant no matter
   * how long the windows are.
   */
  private async fetchScheduleInputs(clinicId: string, from: string, to: string) {
    const [rulesResult, unavailableResult, blocksResult] = await Promise.all([
      this.db
        .from("availability_rules")
        .select("day_of_week, start_time, end_time, slot_duration_minutes")
        .eq("clinic_id", clinicId)
        .eq("is_active", true),
      this.db
        .from("unavailable_dates")
        .select("date")
        .eq("clinic_id", clinicId)
        .gte("date", from)
        .lte("date", to),
      this.db
        .from("consultancy_schedules")
        .select("date, start_time, end_time")
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .gte("date", from)
        .lte("date", to),
    ]);

    if (rulesResult.error) throw new Error(`availability_rules: ${rulesResult.error.message}`);
    if (unavailableResult.error) {
      throw new Error(`unavailable_dates: ${unavailableResult.error.message}`);
    }
    if (blocksResult.error) {
      throw new Error(`consultancy_schedules: ${blocksResult.error.message}`);
    }

    const rulesByDow = new Map<number, AvailabilityRule[]>();
    for (const r of rows<AvailabilityRuleRow & { day_of_week: number }>(rulesResult.data)) {
      const list = rulesByDow.get(r.day_of_week) ?? [];
      list.push({
        startTime: toHhMm(r.start_time),
        endTime: toHhMm(r.end_time),
        slotDurationMinutes: r.slot_duration_minutes,
      });
      rulesByDow.set(r.day_of_week, list);
    }

    const closedDates = new Set(rows<UnavailableDateRow>(unavailableResult.data).map((u) => u.date));

    const blocksByDate = new Map<string, Array<{ start: string; end: string }>>();
    for (const b of rows<ConsultancyBlockDatedRow>(blocksResult.data)) {
      const list = blocksByDate.get(b.date) ?? [];
      list.push({ start: toHhMm(b.start_time), end: toHhMm(b.end_time) });
      blocksByDate.set(b.date, list);
    }

    return { rulesByDow, closedDates, blocksByDate };
  }

  /**
   * Bookable slots the clinic OFFERS on a single date — capacity, not
   * availability. Booked appointments are deliberately not subtracted: the
   * engine divides booked by this figure to get utilization, so netting them off
   * would make utilization always read 0%.
   *
   * Reuses `lib/scheduling/slots.ts` (empty `occupied`, no past-slot cutoff) so
   * capacity is defined in exactly one place, including its handling of rule
   * boundaries and external-consultancy blocks.
   */
  /**
   * Minutes one chair is open on a date: the union of that weekday's active
   * rules, less any consultancy block, zero when the clinic is shut.
   *
   * Deliberately NOT `getAvailableSlots(...).length`, which is what this used to
   * be. That function is correct for booking — it validates that a full
   * appointment fits inside a rule window — but its return is a list of
   * candidate START TIMES stepped at `slot_duration_minutes`, and those overlap.
   * A 09:00-13:00 rule stepped every 10 minutes yields 24 candidates for four
   * hours of chair time. Counting them as capacity inflated the denominator by
   * the ratio of appointment length to step size, so utilization read roughly a
   * third of the truth on this clinic's Mondays and a different fraction on its
   * Fridays.
   *
   * Timezone plays no part: rules are wall-clock times and their length is the
   * same in any zone. Only the closed-date and block lookups are date-keyed, and
   * the caller already resolves those in clinic-local terms.
   */
  private openMinutesOnDate(
    date: string,
    inputs: Awaited<ReturnType<SupabaseMetricsDataRepository["fetchScheduleInputs"]>>,
  ): number {
    if (inputs.closedDates.has(date)) return 0;
    const rules = inputs.rulesByDow.get(dayOfWeek(date)) ?? [];
    if (rules.length === 0) return 0;
    return openMinutes(rules, inputs.blocksByDate.get(date) ?? []);
  }

  /** Total slots offered across an inclusive date range. */
  /** Open minutes per chair summed across an inclusive date range. */
  private openMinutesInRange(
    from: string,
    to: string,
    inputs: Awaited<ReturnType<SupabaseMetricsDataRepository["fetchScheduleInputs"]>>,
  ): number {
    return dateRange(from, to).reduce((sum, d) => sum + this.openMinutesOnDate(d, inputs), 0);
  }

  /** Appointments whose scheduled time falls inside an inclusive date range. */
  private async fetchAppointmentsInRange(
    clinicId: string,
    from: string,
    to: string,
    timezone: string,
  ): Promise<AppointmentSnapshot[]> {
    const { start } = getUtcBoundariesForLocalDate(from, timezone);
    const { end } = getUtcBoundariesForLocalDate(to, timezone);
    return this.fetchAppointments(clinicId, start, end);
  }
}

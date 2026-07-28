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
import { getAvailableSlots, type AvailabilityRule } from "@/lib/scheduling/slots";
import { getUtcBoundariesForLocalDate } from "@/lib/utils";

/**
 * TYPING NOTE
 * -----------
 * `types/database.types.ts` is hand-maintained and does not satisfy
 * @supabase/supabase-js's `GenericSchema` contract (no per-table
 * `Relationships`), so `.from(...).select(...)` infers `never` and the client
 * appears untyped. That is why 16 files in this codebase fall back to
 * `type DbClient = any`.
 *
 * Rather than spread `any` further, every query below declares the exact row
 * shape it selects and narrows the result once through {@link rows}. The
 * mapping code is then fully typed against these declarations — only the
 * client boundary is loose, and it is loose in exactly one place per query.
 *
 * The real fix is `npm run gen:types` (now possible against local Supabase),
 * which reshapes types repo-wide and belongs in its own change.
 */
function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

interface ClinicSettingsRow {
  timezone: string | null;
  average_appointment_duration: number | null;
}
interface AppointmentRow {
  id: string;
  patient_id: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  source: string;
}
interface PatientRow {
  id: string;
  created_at: string;
}
interface TreatmentRow {
  id: string;
  cost: number | string | null;
  clinic_share: number | string | null;
  status: string;
  performed_at: string | null;
}
interface PaymentRow {
  id: string;
  amount: number | string | null;
  payment_date: string;
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
interface ConsultancyBlockRow {
  start_time: string;
  end_time: string;
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
}

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
    const asOf = this.options.asOf ?? new Date().toISOString();

    // Clinic settings drive both the day boundaries and the slot size used for
    // capacity, so they must be resolved before anything date-scoped runs.
    const { data: settings } = await this.db
      .from("clinic_settings")
      .select("timezone, average_appointment_duration")
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const cfg = (settings ?? null) as ClinicSettingsRow | null;
    const timezone = cfg?.timezone ?? DEFAULT_TIMEZONE;
    const slotMinutes = cfg?.average_appointment_duration ?? 30;
    const { start: dayStart, end: dayEnd } = getUtcBoundariesForLocalDate(date, timezone);

    const [
      appointmentsToday,
      patientsRegisteredToday,
      treatments,
      payments,
      queueToday,
      followUps,
      totalSlotsToday,
    ] = await Promise.all([
      this.fetchAppointments(clinicId, dayStart, dayEnd),
      this.fetchPatientsRegistered(clinicId, dayStart, dayEnd),
      this.fetchTreatments(clinicId),
      this.fetchPayments(clinicId),
      this.fetchQueue(clinicId, date),
      this.fetchFollowUps(clinicId, date),
      this.fetchCapacity(clinicId, date, timezone, slotMinutes),
    ]);

    // Depends on today's appointments, so it cannot join the parallel batch.
    const patientsSeenToday = await this.fetchPatientsSeen(
      clinicId,
      appointmentsToday.map((a) => a.patientId),
    );

    return {
      clinicId,
      date,
      asOf,
      appointmentsToday,
      patientsRegisteredToday,
      patientsSeenToday,
      // isScheduled is reported as UNKNOWN, never guessed — see the note above
      // fetchTreatments. DentGrow cannot currently express which future
      // appointment a planned treatment is booked for.
      treatments: treatments.map((t) => ({ ...t, isScheduled: null })),
      payments,
      queueToday,
      followUps,
      capacity: { totalSlotsToday },
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
      .select("id, patient_id, status, scheduled_at, duration_minutes, source")
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
   * `clinic_share` is nullable in DentGrow (no consultant => no split recorded);
   * it is coalesced to `cost` so the engine always receives a real number.
   *
   * KNOWN SCHEMA GAP — `isScheduled` is reported as `null` (unknown)
   * ---------------------------------------------------------------
   * A treatment is "scheduled" when it was accepted but deliberately not done
   * during the visit, and is booked for a specific future appointment.
   *
   * DentGrow cannot express that. `treatments.appointment_id` is NOT NULL and
   * records the visit at which the treatment was *proposed* — it is the same
   * column whether the work happened then or was deferred, so it carries no
   * information about a future booking.
   *
   * The available proxies are all wrong:
   *   - a pending `follow_ups` row is a recall/review, not a booking for this
   *     treatment, and a treatment can be booked with no follow-up at all;
   *   - "the patient has some future appointment" says nothing about whether
   *     THIS treatment is what that appointment is for.
   *
   * Either would report accepted work as booked (or unbooked) on no evidence,
   * so this repository reports `null` and the Metrics Engine withholds
   * `treatment.accepted_pending_scheduling` entirely. The dependent evaluator
   * then skips and records that it could not measure.
   *
   * Smallest fix: add `treatments.scheduled_appointment_id uuid null references
   * appointments(id) on delete set null`. See the "Scheduled treatments" note in
   * the accompanying report.
   */
  private async fetchTreatments(clinicId: string): Promise<Array<Omit<TreatmentSnapshot, "isScheduled">>> {
    const { data, error } = await this.db
      .from("treatments")
      .select("id, cost, clinic_share, status, performed_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null);
    if (error) throw new Error(`treatments: ${error.message}`);

    return rows<TreatmentRow>(data).map((t) => {
      const cost = Number(t.cost ?? 0);
      const share = t.clinic_share == null ? cost : Number(t.clinic_share);
      return {
        id: t.id,
        cost,
        clinicShare: share,
        status: t.status,
        performedAt: t.performed_at,
      };
    });
  }

  /** Clinic-wide payments — cumulative, for the same reason as treatments. */
  private async fetchPayments(clinicId: string): Promise<PaymentSnapshot[]> {
    const { data, error } = await this.db
      .from("payments")
      .select("id, amount, payment_date")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null);
    if (error) throw new Error(`payments: ${error.message}`);

    return rows<PaymentRow>(data).map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      paymentDate: p.payment_date,
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
   * Total bookable slots the clinic OFFERS on the date — capacity, not
   * availability. Booked appointments are deliberately not subtracted here:
   * the engine divides booked by this figure to get chair utilization, so
   * netting them off would make utilization always read 0%.
   *
   * Reuses `lib/scheduling/slots.ts` (empty `occupied`, no past-slot cutoff) so
   * capacity is defined in exactly one place, including its handling of rule
   * boundaries and external-consultancy blocks.
   */
  private async fetchCapacity(
    clinicId: string,
    date: string,
    timezone: string,
    slotMinutes: number,
  ): Promise<number> {
    // A clinic holiday offers no slots at all.
    const { data: unavailable, error: unavailableError } = await this.db
      .from("unavailable_dates")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("date", date)
      .limit(1);
    if (unavailableError) throw new Error(`unavailable_dates: ${unavailableError.message}`);
    if (rows<{ id: string }>(unavailable).length > 0) return 0;

    const [rulesResult, blocksResult] = await Promise.all([
      this.db
        .from("availability_rules")
        .select("start_time, end_time, slot_duration_minutes")
        .eq("clinic_id", clinicId)
        .eq("day_of_week", dayOfWeek(date))
        .eq("is_active", true),
      this.db
        .from("consultancy_schedules")
        .select("start_time, end_time")
        .eq("clinic_id", clinicId)
        .eq("date", date)
        .eq("is_active", true),
    ]);

    if (rulesResult.error) throw new Error(`availability_rules: ${rulesResult.error.message}`);
    if (blocksResult.error) throw new Error(`consultancy_schedules: ${blocksResult.error.message}`);

    const rules: AvailabilityRule[] = rows<AvailabilityRuleRow>(rulesResult.data).map((r) => ({
      startTime: toHhMm(r.start_time),
      endTime: toHhMm(r.end_time),
      slotDurationMinutes: r.slot_duration_minutes,
    }));
    if (rules.length === 0) return 0;

    const blockedRanges = rows<ConsultancyBlockRow>(blocksResult.data).map((b) => ({
      start: toHhMm(b.start_time),
      end: toHhMm(b.end_time),
    }));

    return getAvailableSlots(date, rules, [], timezone, slotMinutes, null, blockedRanges).length;
  }
}

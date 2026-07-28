/**
 * Business Brain — Repositories: Data Snapshots
 *
 * The Business Brain's own read-only view of the clinic data the Metrics
 * Engine needs. These are deliberately NOT DentGrow database rows — they are
 * a narrow, stable shape the engine depends on, so the engine never couples to
 * the database schema.
 *
 * A future phase provides a Supabase-backed implementation that maps DentGrow
 * rows into these snapshots. This phase only defines the shape and consumes it.
 */

/** An appointment scheduled on the target date. */
export interface AppointmentSnapshot {
  readonly id: string;
  readonly patientId: string;
  /** DentGrow appointment_status: scheduled | checked_in | in_progress | completed | cancelled | no_show. */
  readonly status: string;
  /** ISO-8601 time the appointment is scheduled for. */
  readonly scheduledAt: string;
  /** Planned duration in minutes. */
  readonly durationMinutes: number;
  /** DentGrow appointment_source. */
  readonly source: string;
}

/** A patient record, reduced to what metrics need. */
export interface PatientSnapshot {
  readonly id: string;
  /** ISO-8601 timestamp the patient record was created. */
  readonly createdAt: string;
}

/** A recorded payment. */
export interface PaymentSnapshot {
  readonly id: string;
  readonly amount: number;
  /** Calendar date the payment was recorded, "YYYY-MM-DD". */
  readonly paymentDate: string;
}

/** A treatment record, reduced to what metrics need. */
export interface TreatmentSnapshot {
  readonly id: string;
  /**
   * GROSS treatment amount — what the patient owes. Patient billing never uses
   * the consultant split (see `lib/billing/revenue.ts`).
   */
  readonly cost: number;
  /**
   * The clinic's retained share of {@link cost} after any consultant payout.
   *
   * Equals `cost` when no consultant performed the treatment. The repository
   * must coalesce DentGrow's nullable `treatments.clinic_share` column to
   * `cost` when it is null, so this field is always a real number.
   */
  readonly clinicShare: number;
  /** DentGrow treatment_status: planned | in_progress | completed | cancelled. */
  readonly status: string;
  /** ISO-8601 time the treatment was performed, or null if not yet performed. */
  readonly performedAt: string | null;
  /**
   * Whether this treatment is booked to be performed at a FUTURE appointment —
   * i.e. it was accepted but deliberately not carried out during the visit at
   * which it was recorded.
   *
   *   true   the treatment is linked to a future, still-active appointment
   *   false  it is being performed now, was completed, or has no booking
   *   null   NOT DETERMINABLE from the available data
   *
   * `null` is a first-class value, not a placeholder. DentGrow currently has no
   * column expressing "this planned treatment will be performed at appointment
   * X" — `treatments.appointment_id` records the visit at which the treatment
   * was *proposed*, which says nothing about when it will be done. Rather than
   * infer it from a proxy (a follow-up, or any future appointment the patient
   * happens to have), the repository reports `null` and the affected metric is
   * withheld.
   *
   * This mirrors the discipline the Signal and Diagnosis engines already apply:
   * an absence that is "we could not measure" must never be reported as a
   * measured zero.
   */
  readonly isScheduled: boolean | null;
}

/** A queue entry for the target date. */
export interface QueueEntrySnapshot {
  readonly id: string;
  /** DentGrow queue_status: waiting | in_progress | completed. */
  readonly status: string;
  /** ISO-8601 time the patient checked in (started waiting). */
  readonly checkedInAt: string;
  /** ISO-8601 time the patient was called in (waiting ended), or null if still waiting. */
  readonly startedAt: string | null;
}

/** A follow-up record relevant to the target date. */
export interface FollowUpSnapshot {
  readonly id: string;
  /** Due date, "YYYY-MM-DD". */
  readonly dueDate: string;
  /** DentGrow follow_up_status: pending | completed | cancelled. */
  readonly status: string;
}

/** Clinic capacity for the target date, derived from availability rules. */
export interface CapacitySnapshot {
  /** Total bookable appointment slots the clinic offers on the target date. */
  readonly totalSlotsToday: number;
}

/**
 * The complete data snapshot the Metrics Engine reasons over for a single
 * clinic + date. All arrays are already scoped by the repository; the engine
 * only counts, sums, and derives from them.
 */
export interface ClinicDataSnapshot {
  /** The clinic the snapshot belongs to. */
  readonly clinicId: string;
  /** The business date the snapshot describes, "YYYY-MM-DD". */
  readonly date: string;
  /**
   * ISO-8601 moment the data was captured. Used for time-based, deterministic
   * calculations (e.g. current waiting time) and as each metric's timestamp.
   */
  readonly asOf: string;

  /** Appointments scheduled on `date`. */
  readonly appointmentsToday: readonly AppointmentSnapshot[];
  /** Patients whose record was created on `date`. */
  readonly patientsRegisteredToday: readonly PatientSnapshot[];
  /** Patients who have an appointment on `date` (with their creation date). */
  readonly patientsSeenToday: readonly PatientSnapshot[];
  /** Clinic-wide treatments, used for balance and pending-value metrics. */
  readonly treatments: readonly TreatmentSnapshot[];
  /** Clinic-wide payments, used for revenue and outstanding-balance metrics. */
  readonly payments: readonly PaymentSnapshot[];
  /** Queue entries for `date`. */
  readonly queueToday: readonly QueueEntrySnapshot[];
  /** Follow-ups relevant to `date` (pending, due, or overdue). */
  readonly followUps: readonly FollowUpSnapshot[];
  /** Capacity for `date`. */
  readonly capacity: CapacitySnapshot;
}

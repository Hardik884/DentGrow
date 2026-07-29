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
  /**
   * ISO-8601 time the appointment record was created — i.e. when it was booked.
   * Together with `scheduledAt` this gives booking lead time, the clearest read
   * on whether demand is ahead of or behind capacity.
   */
  readonly createdAt: string;
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
  /** DentGrow treatment_status: planned | in_progress | completed | cancelled. */
  readonly status: string;
  /** ISO-8601 time the treatment was performed, or null if not yet performed. */
  readonly performedAt: string | null;
  /**
   * Whether follow-through on this treatment has been booked.
   *
   *   true   the patient has at least one upcoming visit
   *   false  the patient has no upcoming visit
   *   null   NOT DETERMINABLE from the available data
   *
   * Deliberately defined at the PATIENT level, not per treatment. A repository
   * answers "does this treatment's patient have another visit booked?", which
   * is an approximation of "is this specific treatment booked". Modelling the
   * latter exactly requires a treatment-to-appointment link, and the workflow
   * cost of asking a dentist to maintain one is not currently justified.
   *
   * The direction of the error is known and one-way: the derived metric
   * UNDER-reports. Anything it flags as pending scheduling is genuinely
   * unbooked; some genuinely unbooked work is missed because the patient
   * happens to have an unrelated appointment.
   *
   * `null` remains a first-class value for any repository that cannot determine
   * booking state at all. The Metrics Engine then withholds the dependent
   * metric rather than reporting a measured zero — the same discipline the
   * Signal and Diagnosis engines apply to absent input.
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

/**
 * One patient on the clinic's roster, with the two facts retention metrics need.
 *
 * This is the whole active roster rather than a filtered subset: deciding who
 * counts as lapsed is a business rule and belongs in a calculator, not in the
 * repository's query.
 */
export interface PatientRosterEntry {
  readonly id: string;
  /** ISO-8601 timestamp the patient record was created. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the most recent completed visit, or null if never seen. */
  readonly lastVisit: string | null;
  /** Whether the patient has at least one upcoming, non-cancelled appointment. */
  readonly hasUpcomingAppointment: boolean;
}

/**
 * A date range of schedule activity, with the capacity offered across it.
 *
 * Appointments and capacity travel together because every metric that uses a
 * window needs both: a fill rate is meaningless without the denominator, and
 * two separately-supplied ranges could silently disagree about their bounds.
 *
 * Both ends are inclusive "YYYY-MM-DD" business dates.
 */
export interface ScheduleWindow {
  readonly from: string;
  readonly to: string;
  /** Appointments whose `scheduledAt` falls inside the range. */
  readonly appointments: readonly AppointmentSnapshot[];
  /** Total bookable slots the clinic offers across the whole range. */
  readonly totalSlots: number;
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

  /**
   * The clinic's full active patient roster.
   *
   * OPTIONAL by design. A repository that cannot afford to load the roster — or
   * a caller that only wants same-day metrics — omits it, and the metrics that
   * depend on it are withheld rather than reported as zero. Every metric that
   * existed before the roster was introduced is unaffected by its absence.
   */
  readonly patientRoster?: readonly PatientRosterEntry[];

  /**
   * The trailing schedule window ending on `date` (inclusive).
   *
   * Rates and averages need a denominator larger than one day. Dentistry is
   * lumpy — a single cancellation swings a daily rate by tens of percent — so a
   * daily figure is n=1 noise, and thresholds set against it fire on ordinary
   * quiet days.
   *
   * OPTIONAL: a repository that cannot afford the range read omits it, and the
   * window metrics are withheld rather than reported as zero.
   */
  readonly trailingWindow?: ScheduleWindow;

  /**
   * The forward schedule window starting the day AFTER `date` (inclusive).
   *
   * The only forward-looking input the engine has. Everything else reports what
   * already happened; this is what lets it warn while there is still time to
   * act — a clinic can look healthy today and be empty next week.
   *
   * Excludes `date` itself: today is already half-spent, and counting it would
   * make "how full is the week ahead" depend on the time of day.
   *
   * OPTIONAL, as above.
   */
  readonly forwardWindow?: ScheduleWindow;
}

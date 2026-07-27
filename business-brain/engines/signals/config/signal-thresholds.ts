/**
 * Business Brain — Signal Engine: thresholds
 *
 * Every number the Signal Engine compares against lives here. Evaluators are
 * forbidden from containing literals: they receive the resolved config through
 * their `EvaluatorContext` so tests can override any value.
 *
 * Currency values are INR and sized for a single-chair to small (2-3 chair)
 * Indian dental practice.
 */

import type { SignalType } from "../../../domain";
import type { Severity } from "../../../types";

/** Recursive partial, used for threshold overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Per-signal severity clamping. */
export interface SeverityOverride {
  /** Severity is never reported below this level. */
  readonly floor?: Severity;
  /** Severity is never reported above this level. */
  readonly ceiling?: Severity;
}

/** Breach magnitude -> severity band boundaries (inclusive lower bounds). */
export interface SeverityBands {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly critical: number;
}

/** The complete, typed threshold surface of the Signal Engine. */
export interface SignalThresholdConfig {
  readonly revenue: {
    /** Minimum expected collection for a working day (INR). */
    readonly minimumDailyRevenue: number;
    /** Acceptable ceiling for total unpaid patient balances (INR). */
    readonly outstandingBalanceLimit: number;
    /** Growth in outstanding vs previous period that counts as a trend (%). */
    readonly outstandingGrowthRate: number;
    /**
     * Absolute floor for the outstanding trend (INR), anchored to one working
     * day's expected collection. A receivable book smaller than a single normal
     * day's takings is not material however fast it grew; at or above the floor,
     * a zero prior baseline is graded against the floor instead of returning
     * no_signal.
     */
    readonly outstandingGrowthFloor: number;
    /** Appointments required before a low-revenue day is meaningful. */
    readonly minimumActivityForRevenueSignal: number;
    /** Completed treatments required before a collection gap is meaningful. */
    readonly minimumCompletionsForCollectionCheck: number;
  };
  readonly appointments: {
    /** Cancellation share of the day's appointments that is too high (%). */
    readonly highCancellationRate: number;
    /** No-show share of the day's appointments that is too high (%). */
    readonly highNoShowRate: number;
    /** Minimum healthy booked volume for a working day. */
    readonly minimumDailyAppointments: number;
    /** Denominator guard: below this, rates are statistical noise. */
    readonly minimumAppointmentSample: number;
  };
  readonly patients: {
    /** Minimum new patients expected on a working day. */
    readonly minimumNewPatientsPerDay: number;
    /** Fall in returning patients vs previous period that counts (%). */
    readonly returningVolumeDropRate: number;
    /**
     * Absolute floor for the returning-volume trend (patients). A fall smaller
     * than this is not material however large the percentage; when the drop
     * clears the floor but the percentage is undefined, the floor grades it.
     */
    readonly returningVolumeFloor: number;
  };
  readonly queue: {
    /** Waiting-room time that becomes an experience problem (minutes). */
    readonly maximumWaitingTimeMinutes: number;
    /** Simultaneous waiting patients that becomes a backlog. */
    readonly maximumQueueLength: number;
    /** Queue growth vs previous period that counts as a trend (%). */
    readonly queueGrowthRate: number;
    /** Absolute floor: growth below this many patients is not material. */
    readonly queueGrowthFloor: number;
  };
  readonly followups: {
    /** Overdue follow-ups that constitute a backlog. */
    readonly overdueFollowupLimit: number;
  };
  readonly capacity: {
    /** Chair utilization below this is idle capacity (%). */
    readonly minimumChairUtilization: number;
    /** Chair utilization at or above this is effectively full (%). */
    readonly nearCapacityUtilization: number;
    /** Remaining slots at or below this is effectively full. */
    readonly minimumAvailableSlots: number;
  };
  readonly treatment: {
    /** Accepted-but-unbilled treatment value that is too large to ignore (INR). */
    readonly pendingTreatmentValueLimit: number;
    /** Accepted treatments waiting for a date that constitute a backlog. */
    readonly acceptedUnscheduledLimit: number;
  };
  readonly severity: {
    readonly bands: SeverityBands;
    readonly overrides?: Partial<Record<SignalType, SeverityOverride>>;
  };
  readonly confidence: {
    /** Deducted per declared optional metric that was absent. */
    readonly missingOptionalMetricPenalty: number;
    /** Deducted when the governing denominator is a small sample. */
    readonly smallSamplePenalty: number;
    /** Deducted when a metric's period does not match the requested date. */
    readonly stalePeriodPenalty: number;
    /** Confidence never falls below this. */
    readonly floor: number;
    /** Signals below this confidence are suppressed. */
    readonly minimumToEmit: number;
  };
}

/**
 * Defaults for a single-chair to small Indian dental practice.
 *
 * Reasoning is recorded in the phase notes; in short: ~8-12 patients/day at
 * consult/filling/RCT price points of roughly INR 300-8,000 puts a normal
 * working day above INR 5,000 collected, so that is the floor rather than an
 * average.
 */
export const DEFAULT_SIGNAL_THRESHOLDS: SignalThresholdConfig = {
  revenue: {
    minimumDailyRevenue: 5_000,
    outstandingBalanceLimit: 25_000,
    outstandingGrowthRate: 20,
    outstandingGrowthFloor: 5_000,
    minimumActivityForRevenueSignal: 3,
    minimumCompletionsForCollectionCheck: 2,
  },
  appointments: {
    highCancellationRate: 10,
    highNoShowRate: 8,
    minimumDailyAppointments: 5,
    minimumAppointmentSample: 5,
  },
  patients: {
    minimumNewPatientsPerDay: 1,
    returningVolumeDropRate: 30,
    returningVolumeFloor: 2,
  },
  queue: {
    maximumWaitingTimeMinutes: 30,
    maximumQueueLength: 5,
    queueGrowthRate: 50,
    queueGrowthFloor: 3,
  },
  followups: {
    overdueFollowupLimit: 10,
  },
  capacity: {
    minimumChairUtilization: 50,
    nearCapacityUtilization: 90,
    minimumAvailableSlots: 1,
  },
  treatment: {
    pendingTreatmentValueLimit: 50_000,
    acceptedUnscheduledLimit: 5,
  },
  severity: {
    bands: { low: 0.1, medium: 0.25, high: 0.5, critical: 1.0 },
    overrides: {
      // Being busy is not an emergency.
      "operational.near_full_capacity": { ceiling: "medium" },
      // A backlog is always worth surfacing, even when barely over the limit.
      "retention.followup_backlog": { floor: "low" },
      // A quiet day is a business problem, not a crisis.
      "scheduling.low_appointment_volume": { ceiling: "high" },
      // The threshold is 1 patient, so relative breach maths is jumpy here.
      "acquisition.low_new_patients": { ceiling: "medium" },
    },
  },
  confidence: {
    missingOptionalMetricPenalty: 0.1,
    smallSamplePenalty: 0.15,
    stalePeriodPenalty: 0.2,
    floor: 0.3,
    minimumToEmit: 0.4,
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const next = override[key];
    if (next === undefined) continue;
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(next)
        ? deepMerge(current, next)
        : next;
  }
  return result;
}

/**
 * Deep-merge caller overrides onto a defaults object, without mutating either.
 * Shared by every engine that resolves a typed config from partial overrides.
 */
export function mergeOverrides<T>(base: T, overrides?: DeepPartial<T>): T {
  if (!overrides) return base;
  return deepMerge(
    base as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as unknown as T;
}

/**
 * Deep-merge caller overrides onto {@link DEFAULT_SIGNAL_THRESHOLDS}.
 * Pure: the defaults object is never mutated.
 */
export function resolveConfig(
  overrides?: DeepPartial<SignalThresholdConfig>,
): SignalThresholdConfig {
  return mergeOverrides(DEFAULT_SIGNAL_THRESHOLDS, overrides);
}

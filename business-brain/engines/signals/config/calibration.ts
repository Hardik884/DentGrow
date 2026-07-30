/**
 * Signal Engine — per-clinic threshold calibration
 *
 * THE PROBLEM
 * -----------
 * Every threshold in `signal-thresholds.ts` is a global constant, and the file
 * says as much: tuned for a 1-3 chair Indian practice. `minimumDailyAppointments`
 * is 5 for everyone.
 *
 * For a single-chair clinic that normally books 3 a day, that signal fires every
 * single day at high severity. Within a week the dentist stops reading the
 * dashboard, and the genuinely bad day looks identical to Tuesday. For a
 * six-chair practice doing 25 a day, a catastrophic day of 8 clears the bar and
 * nothing fires at all. One number, wrong in both directions.
 *
 * WHAT THIS DOES
 * --------------
 * Sizes the clinic-dependent thresholds from the clinic's own measured facts,
 * so a threshold means the same thing at any scale:
 *
 *   minimumDailyAppointments   a share of the slots THIS clinic offered today
 *   minimumDailyRevenue        a share of what THIS clinic typically takes daily
 *   outstandingBalanceLimit    a multiple of THIS clinic's monthly production
 *   pendingTreatmentValueLimit a multiple of THIS clinic's monthly production
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Rate thresholds (`highNoShowRate` 8%, `highCancellationRate` 10%,
 * `minimumChairUtilization` 50%) stay global. They are industry benchmarks: a
 * 20% no-show rate is bad at any size, and holding them fixed is what keeps
 * clinics comparable. Statistical guards (`minimumAppointmentSample`, the
 * confidence penalties, the severity bands) stay global too — they are about
 * whether a measurement is valid, not about how big the clinic is.
 *
 * `maximumQueueLength` and `overdueFollowupLimit` also stay global, for a duller
 * reason: the honest denominators would be chair count and active roster size,
 * and neither exists yet. Deriving them from something else would be inventing a
 * relationship rather than measuring one.
 *
 * STILL DETERMINISTIC
 * -------------------
 * Calibration reads metrics the engine already produced and returns data. Same
 * clinic data still gives the same thresholds, and therefore the same signals.
 * The run records exactly what it derived and from what (see
 * {@link ThresholdCalibration}) so a figure is never silently tailored.
 */

import type { Metric } from "../../../domain";
import { MetricKey } from "../../metrics/metric-ids";
import type { DeepPartial, SignalThresholdConfig } from "./signal-thresholds";

/**
 * The ratios that turn a clinic fact into a threshold.
 *
 * Each is chosen so the derived value lands near the existing global default for
 * a mid-sized clinic — the point is to make the threshold scale, not to quietly
 * retune what "bad" means.
 */
export const CALIBRATION_RATIOS = {
  /**
   * Booked share of offered slots below which volume counts as low.
   *
   * Deliberately below `minimumChairUtilization` (50%): a clinic at 40% is
   * already flagged as under-utilised, and this second signal should mean
   * something worse than that rather than repeat it.
   */
  MINIMUM_BOOKED_SLOT_SHARE: 0.3,
  /**
   * Share of a typical day's takings below which today counts as a poor day.
   * At 1.0 this would fire on roughly half of all days by construction.
   */
  MINIMUM_DAILY_REVENUE_SHARE: 0.4,
  /** Outstanding beyond one month of production is a collections problem. */
  OUTSTANDING_MONTHS_OF_PRODUCTION: 1.0,
  /**
   * Accepted-but-undelivered work worth more than ~6 weeks of production means
   * the pipeline is filling faster than the clinic can deliver it.
   */
  PENDING_MONTHS_OF_PRODUCTION: 1.5,
} as const;

/** Days in the trailing window the 30-day metrics describe. */
const WINDOW_DAYS = 30;

/** One threshold that was sized from clinic data, and the reasoning behind it. */
export interface ThresholdCalibration {
  /** Dotted path into SignalThresholdConfig, e.g. "appointments.minimumDailyAppointments". */
  readonly path: string;
  /** The value that replaced the global default. */
  readonly value: number;
  /** Plain-language basis, suitable for showing a dentist. */
  readonly basis: string;
}

export interface CalibrationResult {
  /** Overrides to merge over the defaults. Empty when nothing could be derived. */
  readonly overrides: DeepPartial<SignalThresholdConfig>;
  /** What was derived, in the order it was derived. */
  readonly applied: readonly ThresholdCalibration[];
}

/** Look up a metric value by key, or undefined when the metric was not produced. */
function valueOf(metrics: readonly Metric[], key: string): number | undefined {
  const metric = metrics.find((m) => m.id.startsWith(`${key}:`));
  return metric && Number.isFinite(metric.value) ? metric.value : undefined;
}

/**
 * Round to a whole number, never below one.
 *
 * A threshold of zero is not a small threshold — depending on the comparison
 * direction it either never fires or always does. One is the smallest value that
 * still means something.
 */
function atLeastOne(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * Derive per-clinic thresholds from a completed metric set.
 *
 * Pure: no clock, no I/O, no randomness. A metric that is missing, zero or
 * negative yields no override for the thresholds that depend on it, so the
 * global default stands rather than a threshold being sized from nothing. That
 * matters most for a brand-new clinic, which has no production history and would
 * otherwise be handed a threshold of zero.
 */
export function calibrateThresholds(metrics: readonly Metric[]): CalibrationResult {
  const applied: ThresholdCalibration[] = [];
  const appointments: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  const treatment: Record<string, number> = {};

  // ── Capacity-denominated ──────────────────────────────────────────────────
  const slots = valueOf(metrics, MetricKey.CAPACITY_TOTAL_SLOTS_TODAY);
  if (slots !== undefined && slots > 0) {
    const value = atLeastOne(slots * CALIBRATION_RATIOS.MINIMUM_BOOKED_SLOT_SHARE);
    appointments.minimumDailyAppointments = value;
    applied.push({
      path: "appointments.minimumDailyAppointments",
      value,
      basis: `${Math.round(CALIBRATION_RATIOS.MINIMUM_BOOKED_SLOT_SHARE * 100)}% of the ${slots} appointment slots offered today`,
    });
  }

  // ── Ratio to this clinic's own money ──────────────────────────────────────
  const collected30d = valueOf(metrics, MetricKey.REVENUE_COLLECTED_30D);
  if (collected30d !== undefined && collected30d > 0) {
    const typicalDay = collected30d / WINDOW_DAYS;
    const value = atLeastOne(typicalDay * CALIBRATION_RATIOS.MINIMUM_DAILY_REVENUE_SHARE);
    revenue.minimumDailyRevenue = value;
    applied.push({
      path: "revenue.minimumDailyRevenue",
      value,
      basis: `${Math.round(CALIBRATION_RATIOS.MINIMUM_DAILY_REVENUE_SHARE * 100)}% of your typical daily takings over the last 30 days`,
    });
  }

  const production30d = valueOf(metrics, MetricKey.REVENUE_PRODUCTION_30D);
  if (production30d !== undefined && production30d > 0) {
    const outstanding = atLeastOne(
      production30d * CALIBRATION_RATIOS.OUTSTANDING_MONTHS_OF_PRODUCTION,
    );
    revenue.outstandingBalanceLimit = outstanding;
    applied.push({
      path: "revenue.outstandingBalanceLimit",
      value: outstanding,
      basis: `${CALIBRATION_RATIOS.OUTSTANDING_MONTHS_OF_PRODUCTION} month of the work you completed in the last 30 days`,
    });

    const pending = atLeastOne(production30d * CALIBRATION_RATIOS.PENDING_MONTHS_OF_PRODUCTION);
    treatment.pendingTreatmentValueLimit = pending;
    applied.push({
      path: "treatment.pendingTreatmentValueLimit",
      value: pending,
      basis: `${CALIBRATION_RATIOS.PENDING_MONTHS_OF_PRODUCTION} months of the work you completed in the last 30 days`,
    });
  }

  const overrides: DeepPartial<SignalThresholdConfig> = {};
  if (Object.keys(appointments).length > 0) {
    (overrides as Record<string, unknown>).appointments = appointments;
  }
  if (Object.keys(revenue).length > 0) {
    (overrides as Record<string, unknown>).revenue = revenue;
  }
  if (Object.keys(treatment).length > 0) {
    (overrides as Record<string, unknown>).treatment = treatment;
  }

  return { overrides, applied };
}

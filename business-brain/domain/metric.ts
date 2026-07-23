/**
 * Business Brain — Domain: Metric
 *
 * A measurable business KPI at a point in time (e.g. Daily Revenue, Chair
 * Utilization, Follow-up Rate). Metrics are the quantitative vocabulary the
 * rest of the Business Brain reasons about.
 */

/**
 * The business area a metric belongs to. Used for grouping and routing.
 */
export const MetricCategory = {
  REVENUE: "revenue",
  UTILIZATION: "utilization",
  RETENTION: "retention",
  SCHEDULING: "scheduling",
  CLINICAL: "clinical",
  ACQUISITION: "acquisition",
  OPERATIONAL: "operational",
} as const;

export type MetricCategory = (typeof MetricCategory)[keyof typeof MetricCategory];

/**
 * The unit a metric's value is expressed in. Drives formatting in the UI.
 */
export const MetricUnit = {
  CURRENCY: "currency",
  PERCENTAGE: "percentage",
  COUNT: "count",
  RATIO: "ratio",
  HOURS: "hours",
  MINUTES: "minutes",
  DAYS: "days",
} as const;

export type MetricUnit = (typeof MetricUnit)[keyof typeof MetricUnit];

/**
 * The inclusive time window a metric describes.
 */
export interface MetricPeriod {
  /** ISO-8601 start of the window. */
  readonly start: string;
  /** ISO-8601 end of the window. */
  readonly end: string;
}

/**
 * A single measured KPI value.
 */
export interface Metric {
  /** Stable identifier for this metric measurement. */
  readonly id: string;
  /** Human-readable name (e.g. "Daily Revenue"). */
  readonly name: string;
  /** The measured numeric value. */
  readonly value: number;
  /** Unit the value is expressed in. */
  readonly unit: MetricUnit;
  /** Business area the metric belongs to. */
  readonly category: MetricCategory;
  /** ISO-8601 timestamp the value was measured at. */
  readonly timestamp: string;
  /** Optional time window the value aggregates over. */
  readonly period?: MetricPeriod;
}

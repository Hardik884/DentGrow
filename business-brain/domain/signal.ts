/**
 * Business Brain — Domain: Signal
 *
 * Something that requires attention (e.g. Payment overdue, Empty chair,
 * Treatment not started). A Signal is a noteworthy event surfaced from
 * metrics/data — it states WHAT is happening, not why.
 */

import type { Confidence, Evidence, Priority, Severity } from "../types";
import type { RelatedEntity } from "./shared";

/**
 * Broad grouping of signals for filtering and routing.
 */
export const SignalCategory = {
  FINANCIAL: "financial",
  SCHEDULING: "scheduling",
  CLINICAL: "clinical",
  RETENTION: "retention",
  OPERATIONAL: "operational",
} as const;

export type SignalCategory = (typeof SignalCategory)[keyof typeof SignalCategory];

/**
 * Stable, machine-readable identifier for every kind of signal the Business
 * Brain can raise. Mirrors the `MetricKey` pattern: the string value is part
 * of the signal's public id and must never be renamed casually.
 */
export const SignalType = {
  // Financial
  REVENUE_LOW_DAILY_REVENUE: "revenue.low_daily_revenue",
  REVENUE_HIGH_OUTSTANDING: "revenue.high_outstanding",
  REVENUE_OUTSTANDING_INCREASING: "revenue.outstanding_increasing",
  REVENUE_COLLECTION_LAGGING_COMPLETIONS: "revenue.collection_lagging_completions",
  // Scheduling
  SCHEDULING_HIGH_CANCELLATION_RATE: "scheduling.high_cancellation_rate",
  SCHEDULING_HIGH_NO_SHOW_RATE: "scheduling.high_no_show_rate",
  SCHEDULING_LOW_APPOINTMENT_VOLUME: "scheduling.low_appointment_volume",
  // Retention / acquisition
  ACQUISITION_LOW_NEW_PATIENTS: "acquisition.low_new_patients",
  RETENTION_RETURNING_VOLUME_DROPPING: "retention.returning_volume_dropping",
  RETENTION_FOLLOWUP_BACKLOG: "retention.followup_backlog",
  // Operational
  OPERATIONAL_LONG_WAITING_TIME: "operational.long_waiting_time",
  OPERATIONAL_QUEUE_BACKLOG: "operational.queue_backlog",
  OPERATIONAL_QUEUE_BUILDING_UP: "operational.queue_building_up",
  OPERATIONAL_LOW_CHAIR_UTILIZATION: "operational.low_chair_utilization",
  OPERATIONAL_NEAR_FULL_CAPACITY: "operational.near_full_capacity",
  // Clinical
  CLINICAL_LARGE_PENDING_TREATMENT_VALUE: "clinical.large_pending_treatment_value",
  CLINICAL_ACCEPTED_TREATMENTS_UNSCHEDULED: "clinical.accepted_treatments_unscheduled",
  CLINICAL_PIPELINE_STALLED: "clinical.pipeline_stalled",
} as const;

export type SignalType = (typeof SignalType)[keyof typeof SignalType];

/**
 * A single attention-worthy event.
 */
export interface Signal {
  /** Stable identifier for this signal. */
  readonly id: string;
  /** Short headline (e.g. "Payment overdue"). */
  readonly title: string;
  /** Fuller explanation of what was detected. */
  readonly description: string;
  /** How serious the situation is. */
  readonly severity: Severity;
  /** How urgently it should be handled. */
  readonly priority: Priority;
  /** Optional grouping category. */
  readonly category?: SignalCategory;
  /** DentGrow entities this signal concerns. */
  readonly relatedEntities: readonly RelatedEntity[];
  /** Optional ids of the metrics this signal was derived from. */
  readonly metricIds?: readonly string[];
  /** ISO-8601 timestamp of when the signal was generated. */
  readonly generatedAt: string;
  /**
   * How complete and trustworthy the underlying data was, in [0, 1].
   * This is a data-completeness score, NOT an AI probability.
   */
  readonly confidence?: Confidence;
  /** Measurable justification for why this signal exists. */
  readonly evidence?: readonly Evidence[];
}

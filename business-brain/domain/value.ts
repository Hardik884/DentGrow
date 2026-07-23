/**
 * Business Brain — Domain: Value
 *
 * A measurable business impact (e.g. Revenue recovered, Hours saved,
 * Appointments booked). Value quantifies what an action or strategy actually
 * delivered, in terms the clinic cares about.
 */

import type { MetricUnit } from "./metric";

/**
 * The kind of business impact being measured.
 */
export const ValueType = {
  REVENUE_RECOVERED: "revenue_recovered",
  HOURS_SAVED: "hours_saved",
  APPOINTMENTS_BOOKED: "appointments_booked",
  RETENTION_IMPROVED: "retention_improved",
  OTHER: "other",
} as const;

export type ValueType = (typeof ValueType)[keyof typeof ValueType];

/**
 * A single quantified impact.
 */
export interface Value {
  /** Stable identifier for this value measurement. */
  readonly id: string;
  /** The kind of impact. */
  readonly type: ValueType;
  /** The measured amount of impact. */
  readonly amount: number;
  /** Unit the amount is expressed in. */
  readonly unit: MetricUnit;
  /** Optional human-readable note about how the value was measured. */
  readonly description?: string;
  /** ISO-8601 timestamp of when the value was measured. */
  readonly measuredAt: string;
}

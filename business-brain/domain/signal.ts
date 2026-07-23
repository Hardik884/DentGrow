/**
 * Business Brain — Domain: Signal
 *
 * Something that requires attention (e.g. Payment overdue, Empty chair,
 * Treatment not started). A Signal is a noteworthy event surfaced from
 * metrics/data — it states WHAT is happening, not why.
 */

import type { Priority, Severity } from "../types";
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
}

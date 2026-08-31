/**
 * Business Brain — Domain: Constraint
 *
 * The primary bottleneck limiting the clinic (e.g. Low treatment acceptance,
 * Poor scheduling, Revenue leakage). A Constraint is the single most important
 * thing to solve, usually derived from diagnoses.
 */

import type { Severity } from "../types";

/**
 * The kind of bottleneck a constraint represents.
 */
export const ConstraintCategory = {
  TREATMENT_ACCEPTANCE: "treatment_acceptance",
  SCHEDULING: "scheduling",
  REVENUE_LEAKAGE: "revenue_leakage",
  CAPACITY: "capacity",
  RETENTION: "retention",
  ACQUISITION: "acquisition",
  /**
   * Chair time offered over the coming week and not yet sold.
   *
   * Deliberately NOT folded into CAPACITY, even though both describe the same
   * resource. CAPACITY is sized and worded entirely in terms of the day that has
   * just happened — the Value Engine measures it as today's open minutes that
   * went unbooked — so a finding about next Thursday landing in that bucket
   * would be handed today's idle-minutes figure as its value and today's
   * "your chair was empty" wording as its explanation. Both would be wrong, and
   * wrong in the confident voice the rest of the pipeline works to avoid.
   *
   * The distinction that matters to a clinic is not the resource, it is the
   * tense: capacity already lost cannot be recovered, capacity still ahead can
   * be filled. They warrant different words and different actions.
   */
  FORWARD_SCHEDULE: "forward_schedule",
} as const;

export type ConstraintCategory =
  (typeof ConstraintCategory)[keyof typeof ConstraintCategory];

/**
 * A bottleneck affecting clinic performance.
 */
export interface Constraint {
  /** Stable identifier for this constraint. */
  readonly id: string;
  /** Short name (e.g. "Low treatment acceptance"). */
  readonly name: string;
  /** Fuller description of the bottleneck and its impact. */
  readonly description: string;
  /** The kind of bottleneck. */
  readonly category: ConstraintCategory;
  /** How severely it limits the clinic. */
  readonly severity: Severity;
  /** Ids of the diagnoses that point to this constraint. */
  readonly relatedDiagnosisIds?: readonly string[];
  /** ISO-8601 timestamp of when the constraint was identified. */
  readonly identifiedAt: string;
}

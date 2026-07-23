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
